import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { Router, ActivatedRoute } from '@angular/router';

interface Sentencia {
  numero_proceso: string;
  asunto: string;
  nombre_estudiante: string;
  email_estudiante: string;
  nombre_docente: string;
  email_docente: string;
  archivoURL?: string;
  estado?: 'aceptar' | 'negar' | null;
  razon?: string;
  isLocked?: boolean;
  periodo_academico?: string;
  fecha_creacion?: any;
  fecha_actualizacion?: any;

  // Criterios para Dimensiones Cuantificables
  unidad_jurisdiccional?: string;
  canton?: string;
  provincia?: string;
  anio_inicio?: number;
  fecha_emision?: string | Date;
  tipo_procedimiento?: string;
  genero_actor?: string;
  genero_demandado?: string;
  tipo_actor?: string;
  tipo_demandado?: string;
  recursos_horizontales?: string;
  recurso_horizontal_tipo?: string;
  recursos_verticales?: string;
  recurso_vertical_tipo?: string;
}

@Component({
  selector: 'app-sentencias-page',
  templateUrl: './sentencias-page.component.html',
  styleUrls: ['./sentencias-page.component.css']
})
export class SentenciasPageComponent implements OnInit {
  alerta: boolean = false;
  fileLoaded: boolean = false;
  cargando = false;

  sentencia: Sentencia = {
    numero_proceso: '',
    asunto: '',
    nombre_estudiante: '',
    email_estudiante: '',
    nombre_docente: '',
    email_docente: '',
    archivoURL: '',
    estado: null,
    razon: '',
    isLocked: false,
    periodo_academico: '',
    unidad_jurisdiccional: '',
    canton: '',
    provincia: '',
    anio_inicio: undefined,
    fecha_emision: '',
    tipo_procedimiento: '',
    genero_actor: '',
    genero_demandado: '',
    tipo_actor: '',
    tipo_demandado: '',
    recursos_horizontales: '',
    recurso_horizontal_tipo: '',
    recursos_verticales: '',
    recurso_vertical_tipo: ''
  };

  docentes$: Observable<any[]> = new Observable<any[]>();
  selectedFile: File | null = null;
  archivoMensaje: string = 'Sin subir archivo';
  alertas: string[] = [];
  mensajeExito: string = '';
  mostrarMensajeExito: boolean = false;
  alertModalVisible: boolean = false;
  alertModalMessage: string = '';
  isInfoOnly: boolean = false;
  archivo: File | null = null;

  // VARIABLES PARA EL BUSCADOR DE DOCENTES
  docentesLista: any[] = [];
  filteredDocentes: any[] = [];
  searchTermDocente: string = '';
  showDropdown: boolean = false;

  // VARIABLES DE ROL
  isAdmin: boolean = false;
  currentUserRole: string | null = null;

  // VARIABLES PARA EDICIÓN
  isEditMode: boolean = false;
  sentenciaId: string = '';
  continuaDocente: boolean = true;
  filteredDocentesNuevo: any[] = [];
  searchTermNuevo: string = '';
  showDropdownNuevo: boolean = false;
  nuevoDocente: string = '';
  nuevoEmailDocente: string = '';

  // VARIABLES PARA OPCIONES "OTRO" EN FRONTEND
  opcion_categoria_procedimiento: string = '';
  opcion_tipo_procedimiento: string = '';
  opcion_genero_actor: string = '';
  opcion_genero_demandado: string = '';
  opcion_tipo_actor: string = '';
  opcion_tipo_demandado: string = '';
  opcion_recurso_horizontal_tipo: string = '';
  opcion_recurso_vertical_tipo: string = '';

  // MATERIAS DISPONIBLES
  materiasDisponibles: string[] = [
    'Civil',
    'Penal',
    'Constitucional',
    'Mercantil',
    'Inquilinato y relaciones vecinales',
    'Laboral',
    'Familia, mujer, niñez y adolescencia',
    'Multicompetente',
    'Multi. civil',
    'Multi. penal',
    'Tránsito',
    'Violencia contra la mujer o miembro del núcleo familiar',
    'Contravenciones',
    'Tribunales de garantías penales',
    'Tribunales contencioso administrativo',
    'Contencioso tributario'
  ];

  constructor(
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.afAuth.authState.subscribe(user => {
      if (user) {
        this.firestore.collection('users').doc(user.uid).valueChanges().subscribe((userData: any) => {
          if (!this.isEditMode) {
             this.sentencia.nombre_estudiante = userData.name;
             this.sentencia.email_estudiante = userData.email;
          }
          this.currentUserRole = userData.role;
          this.isAdmin = userData.isAdmin === true;
        });
      }
    });

    this.route.queryParams.subscribe(params => {
      const numeroProceso = params['numero_proceso'];
      const emailEstudiante = params['email_estudiante'];
      const emailDocente = params['email_docente'];

      if (numeroProceso) {
        this.isEditMode = true;
        if (emailEstudiante) {
          this.cargarSentencia(numeroProceso, emailEstudiante, emailDocente);
        } else {
          this.cargarSentenciaPorNumero(numeroProceso);
        }
      }
    });

    this.firestore
      .collection('users', ref => ref.where('role', '==', 'docente'))
      .valueChanges()
      .pipe(
        map((docentes: any[]) => {
          const docentesActivos = docentes.filter(d => d.isActive !== false);
          return docentesActivos.sort((a, b) => a.name.localeCompare(b.name));
        })
      )
      .subscribe(data => {
        this.docentesLista = data;
        this.filteredDocentes = data;
        this.filteredDocentesNuevo = data;
      });

    this.docentes$ = this.firestore
      .collection('users', ref => ref.where('role', '==', 'docente'))
      .valueChanges()
      .pipe(
        map((docentes: any[]) => {
          const docentesActivos = docentes.filter(d => d.isActive !== false);
          return docentesActivos.sort((a, b) => a.name.localeCompare(b.name));
        })
      );

    if (!this.isEditMode) {
        this.obtenerPeriodoActivoDesdeBD();
    }
  }

  // MÉTODO PARA INICIALIZAR LAS VARIABLES "OTRO" EN MODO EDICIÓN
  inicializarOpcionesOtro() {
    const defaultTipoActorDemandado = ['Persona natural', 'Persona jurídica'];
    const defaultGenero = ['Masculino', 'Femenino'];
    const defaultRH = ['Aclaración', 'Reforma', 'Ampliación', 'Revocatoria'];
    const defaultRV = ['Apelación'];

    const todosProcedimientos = [
      'Procedimiento Ordinario (Civil)', 'Procedimiento Sumario (Civil)', 'Procedimiento Ejecutivo (Civil)', 'Procedimiento Monitorio (Civil)', 'Procedimiento Voluntario (Civil)',
      'Procedimiento Ordinario (Penal)', 'Procedimiento Abreviado', 'Procedimiento Directo', 'Procedimiento Expedito', 'El procedimiento para el ejercicio privado de la acción penal', 'Procedimiento para delitos de violencia contra la mujer y núcleo familiar',
      'Acción de protección', 'Acción de Hábeas corpus', 'Acción de Hábeas data', 'Acción de Acceso a la información',
      'Procedimiento común', 'Procedimiento de bienes y servicios', 'Ejecución coactiva, sancionador', 'LOSEP procedimiento disciplinario'
    ];

    // Procedimiento
    if (this.sentencia.tipo_procedimiento) {
      if (['Procedimiento Ordinario (Civil)', 'Procedimiento Sumario (Civil)', 'Procedimiento Ejecutivo (Civil)', 'Procedimiento Monitorio (Civil)', 'Procedimiento Voluntario (Civil)'].includes(this.sentencia.tipo_procedimiento)) {
        this.opcion_categoria_procedimiento = 'Civil';
        this.opcion_tipo_procedimiento = this.sentencia.tipo_procedimiento;
      } else if (['Procedimiento Ordinario (Penal)', 'Procedimiento Abreviado', 'Procedimiento Directo', 'Procedimiento Expedito', 'El procedimiento para el ejercicio privado de la acción penal', 'Procedimiento para delitos de violencia contra la mujer y núcleo familiar'].includes(this.sentencia.tipo_procedimiento)) {
        this.opcion_categoria_procedimiento = 'Penal';
        this.opcion_tipo_procedimiento = this.sentencia.tipo_procedimiento;
      } else if (['Acción de protección', 'Acción de Hábeas corpus', 'Acción de Hábeas data', 'Acción de Acceso a la información'].includes(this.sentencia.tipo_procedimiento)) {
        this.opcion_categoria_procedimiento = 'Constitucional';
        this.opcion_tipo_procedimiento = this.sentencia.tipo_procedimiento;
      } else if (['Procedimiento común', 'Procedimiento de bienes y servicios', 'Ejecución coactiva, sancionador', 'LOSEP procedimiento disciplinario'].includes(this.sentencia.tipo_procedimiento)) {
        this.opcion_categoria_procedimiento = 'Administrativo';
        this.opcion_tipo_procedimiento = this.sentencia.tipo_procedimiento;
      } else {
        this.opcion_categoria_procedimiento = 'Otro';
        this.opcion_tipo_procedimiento = 'Otro';
      }
    }

    // Genero
    if (this.sentencia.genero_actor) {
      this.opcion_genero_actor = defaultGenero.includes(this.sentencia.genero_actor) ? this.sentencia.genero_actor : 'Otro';
    }
    if (this.sentencia.genero_demandado) {
      this.opcion_genero_demandado = defaultGenero.includes(this.sentencia.genero_demandado) ? this.sentencia.genero_demandado : 'Otro';
    }

    // Tipo actor/demandado
    if (this.sentencia.tipo_actor) {
      this.opcion_tipo_actor = defaultTipoActorDemandado.includes(this.sentencia.tipo_actor) ? this.sentencia.tipo_actor : 'Otro';
    }
    if (this.sentencia.tipo_demandado) {
      this.opcion_tipo_demandado = defaultTipoActorDemandado.includes(this.sentencia.tipo_demandado) ? this.sentencia.tipo_demandado : 'Otro';
    }

    // Recursos
    if (this.sentencia.recursos_horizontales === 'si' && this.sentencia.recurso_horizontal_tipo) {
      this.opcion_recurso_horizontal_tipo = defaultRH.includes(this.sentencia.recurso_horizontal_tipo) ? this.sentencia.recurso_horizontal_tipo : 'Otro';
    }
    if (this.sentencia.recursos_verticales === 'si' && this.sentencia.recurso_vertical_tipo) {
      this.opcion_recurso_vertical_tipo = defaultRV.includes(this.sentencia.recurso_vertical_tipo) ? this.sentencia.recurso_vertical_tipo : 'Otro';
    }
  }

  getProcedimientos(materia: string): string[] {
    const list = [];
    if (materia === 'Civil') {
      list.push('Procedimiento Ordinario', 'Procedimiento Sumario', 'Procedimiento Ejecutivo', 'Procedimiento Monitorio', 'Procedimiento Voluntario');
    } else if (materia === 'Penal') {
      list.push('Procedimiento Ordinario', 'Procedimiento Abreviado', 'Procedimiento Directo', 'Procedimiento Expedito', 'El procedimiento para el ejercicio privado de la acción penal', 'Procedimiento para delitos de violencia contra la mujer y núcleo familiar');
    } else if (materia === 'Constitucional') {
      list.push('Acción de protección', 'Acción de Hábeas corpus', 'Acción de Hábeas data', 'Acción de Acceso a la información');
    } else if (materia === 'Tribunales contencioso administrativo' || materia === 'Contencioso tributario') {
      list.push('Procedimiento común', 'Procedimiento de bienes y servicios', 'Ejecución coactiva, sancionador', 'LOSEP procedimiento disciplinario');
    }
    return list;
  }

  manejoCambioProcedimiento() {
    if (this.opcion_tipo_procedimiento !== 'Otro') {
       this.sentencia.tipo_procedimiento = this.opcion_tipo_procedimiento;
    } else {
       this.sentencia.tipo_procedimiento = '';
    }
  }

  manejarCambioOpcion(opcionName: string, propName: string) {
    const value = (this as any)[opcionName];
    if (value !== 'Otro') {
      (this.sentencia as any)[propName] = value;
    } else {
      (this.sentencia as any)[propName] = '';
    }
  }

  // BUSCADORES
  filterDocentes() {
    const term = this.searchTermDocente.toLowerCase();
    this.filteredDocentes = this.docentesLista.filter(doc =>
      doc.name.toLowerCase().includes(term) || doc.email.toLowerCase().includes(term)
    );
    this.showDropdown = true;
  }
  selectDocente(docente: any) {
    this.searchTermDocente = docente.name;
    this.sentencia.nombre_docente = docente.name;
    this.sentencia.email_docente = docente.email;
    this.showDropdown = false;
  }
  hideDropdown() { setTimeout(() => { this.showDropdown = false; }, 200); }

  filterDocentesNuevo() {
    const term = this.searchTermNuevo.toLowerCase();
    this.filteredDocentesNuevo = this.docentesLista.filter(doc =>
      doc.name.toLowerCase().includes(term) || doc.email.toLowerCase().includes(term)
    );
    this.showDropdownNuevo = true;
  }
  selectDocenteNuevo(docente: any) {
    this.searchTermNuevo = docente.name;
    this.nuevoDocente = docente.name;
    this.nuevoEmailDocente = docente.email;
    this.showDropdownNuevo = false;
  }
  hideDropdownNuevo() { setTimeout(() => { this.showDropdownNuevo = false; }, 200); }

  obtenerPeriodoActivoDesdeBD() {
    this.firestore.collection('periodoAcademico', ref => ref.where('activo', '==', true).limit(1)
    ).get().subscribe(snapshot => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as any;
        this.sentencia.periodo_academico = data.nombre;
      } else {
        this.sentencia.periodo_academico = 'Periodo No Definido';
      }
    });
  }

  cargarSentenciaPorNumero(numeroProceso: string): void {
    this.firestore.collection('sentencias', ref => ref.where('numero_proceso', '==', numeroProceso).limit(1)
    ).get().subscribe(
      snapshot => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          this.sentenciaId = doc.id;
          this.sentencia = doc.data() as Sentencia;
          this.searchTermDocente = this.sentencia.nombre_docente;
          this.inicializarOpcionesOtro();
          if (this.sentencia.archivoURL) {
            this.archivoMensaje = 'Archivo actual cargado';
            this.fileLoaded = true;
          }
        } else {
          this.alertas.push(`No se encontró ninguna sentencia con el número: ${numeroProceso}`);
          setTimeout(() => this.router.navigate(['/principal']), 3000);
        }
      },
      error => { this.alertas.push('Error al cargar la sentencia: ' + error.message); }
    );
  }

  cargarSentencia(numeroProceso: string, emailEstudiante: string, emailDocente?: string): void {
    const query = this.firestore.collection('sentencias', ref => {
      let baseQuery = ref.where('numero_proceso', '==', numeroProceso).where('email_estudiante', '==', emailEstudiante);
      if (emailDocente) { baseQuery = baseQuery.where('email_docente', '==', emailDocente); }
      return baseQuery.limit(1);
    });

    query.get().subscribe(
      snapshot => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          this.sentenciaId = doc.id;
          this.sentencia = doc.data() as Sentencia;
          this.searchTermDocente = this.sentencia.nombre_docente;
          this.inicializarOpcionesOtro();
          if (this.sentencia.archivoURL) {
            this.archivoMensaje = 'Archivo actual cargado';
            this.fileLoaded = true;
          }
        } else {
          if (emailDocente) {
            this.cargarSentencia(numeroProceso, emailEstudiante);
            return;
          }
          this.alertas.push(`No se encontró la sentencia.`);
          setTimeout(() => { this.router.navigate(['/principal']); }, 3000);
        }
      },
      error => { this.alertas.push('Error al cargar la sentencia: ' + error.message); }
    );
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.archivo = file;
      this.fileLoaded = true;
      this.archivoMensaje = 'Archivo cargado: ' + file.name;
    } else {
      this.selectedFile = null;
      this.archivo = null;
      this.fileLoaded = false;
      this.archivoMensaje = 'Sin subir archivo';
    }
  }

  async submitForm(): Promise<void> {
    this.alertas = [];
    this.cargando = true;

    // VALIDAMOS LIMPIEZA DE DATOS (DEPENDENCIAS)
    if (this.sentencia.recursos_horizontales === 'no') {
      this.sentencia.recurso_horizontal_tipo = 'No';
    }
    if (this.sentencia.recursos_verticales === 'no') {
      this.sentencia.recurso_vertical_tipo = 'No';
    }

    if (!this.sentencia.numero_proceso || this.sentencia.numero_proceso.trim() === '') {
      this.alertas.push('El número de proceso es obligatorio.');
      this.cargando = false;
      return;
    }
    
    // Check missing fields (the basic ones, HTML5 required will handle most)
    if (!this.sentencia.asunto) {
      this.alertas.push('Seleccione la Materia o asunto de la sentencia.');
      this.cargando = false;
      return;
    }

    if (!this.isEditMode && (!this.sentencia.periodo_academico || this.sentencia.periodo_academico === 'Periodo No Definido')) {
      this.alertas.push('Error: No hay un periodo académico activo en el sistema.');
      this.cargando = false;
      return;
    }

    if (this.isEditMode) {
      if (!this.isAdmin) {
        this.procederConActualizacion();
        return;
      }
      
      this.firestore.collection('sentencias', ref => ref.where('numero_proceso', '==', this.sentencia.numero_proceso))
      .get().subscribe({
        next: (querySnapshot) => {
          const yaExisteAprobada = querySnapshot.docs.some(doc => {
            const data = doc.data() as any;
            return doc.id !== this.sentenciaId && data['estado'] === 'aceptar';
          });
          if (yaExisteAprobada) {
            this.alertas.push('El número de proceso ya fue aprobado en otra sentencia.');
            this.cargando = false;
            return;
          }
          this.procederConActualizacion();
        },
        error: (err) => {
          console.error('Error al verificar duplicados:', err);
          this.procederConActualizacion();
        }
      });
      return;
    }

    const checkArchivo = new Promise<void>((resolve) => {
      if (!this.archivo) { this.alertas.push('Debe seleccionar un archivo PDF.'); }
      resolve();
    });

    const checkDocente = new Promise<void>((resolve) => {
      if (!this.sentencia.nombre_docente || !this.sentencia.email_docente) {
        this.alertas.push('Debe seleccionar un docente válido de la lista.');
      }
      resolve();
    });

    const checkNumeroProceso = new Promise<void>((resolve) => {
      this.firestore.collection('sentencias', ref => ref.where('numero_proceso', '==', this.sentencia.numero_proceso)
      ).get().subscribe(querySnapshot => {
        const yaExisteAprobada = querySnapshot.docs.some(doc => (doc.data() as any)['estado'] === 'aceptar');
        if (yaExisteAprobada) { this.alertas.push('El número de proceso ya fue aprobado y no se puede volver a subir.'); }
        resolve();
      });
    });

    Promise.all([checkArchivo, checkDocente, checkNumeroProceso]).then(() => {
      if (this.alertas.length === 0) {
        this.uploadFileAndSaveSentencia();
      } else {
        this.cargando = false;
      }
    });
  }

  private uploadFileAndSaveSentencia(): void {
    const filePath = `sentencias/${this.archivo!.name}_${Date.now()}`;
    const fileRef = this.storage.ref(filePath);
    const uploadTask = this.storage.upload(filePath, this.archivo);

    uploadTask.snapshotChanges().pipe(
      finalize(() => {
        fileRef.getDownloadURL().subscribe(url => {
          this.sentencia.archivoURL = url;

          const sentenciaAGuardar = {
            ...this.sentencia,
            fecha_creacion: new Date(),
            fecha_actualizacion: new Date()
          };

          this.firestore.collection('sentencias').add(sentenciaAGuardar)
            .then(() => {
              this.cargando = false;
              this.alertModalMessage = 'Sentencia creada correctamente. La propuesta ha quedado pendiente de aprobación o rechazo por parte del docente.';
              this.alertModalVisible = true;
            })
            .catch(error => {
              this.alertas.push('Error al guardar la sentencia.');
              this.cargando = false;
            });
        });
      })
    ).subscribe();
  }

  private procederConActualizacion() {
    if (this.archivo) {
      const filePath = `sentencias/${this.archivo.name}_${Date.now()}`;
      const fileRef = this.storage.ref(filePath);
      const uploadTask = this.storage.upload(filePath, this.archivo);

      uploadTask.snapshotChanges().pipe(
        finalize(() => {
          fileRef.getDownloadURL().subscribe(url => {
            this.sentencia.archivoURL = url;
            this.actualizarSentencia();
          });
        })
      ).subscribe();
    } else {
      this.actualizarSentencia();
    }
  }

  actualizarSentencia(): void {
    const datosActualizados: any = {
      ...this.sentencia,
      fecha_actualizacion: new Date()
    };

    if (this.continuaDocente) {
      datosActualizados.nombre_docente = this.sentencia.nombre_docente;
      datosActualizados.email_docente = this.sentencia.email_docente;
    } else {
      datosActualizados.nombre_docente_antiguo = this.sentencia.nombre_docente;
      datosActualizados.email_docente_antiguo = this.sentencia.email_docente;
      datosActualizados.nombre_docente = this.nuevoDocente;
      datosActualizados.email_docente = this.nuevoEmailDocente;
    }

    this.firestore.collection('sentencias').doc(this.sentenciaId).update(datosActualizados)
      .then(() => {
        this.cargando = false;
        this.mensajeExito = 'Sentencia actualizada correctamente';
        this.mostrarMensajeExito = true;
        setTimeout(() => this.router.navigate(['/principal']), 2000);
      }).catch(error => {
        this.alertas.push('Hubo un error al actualizar la sentencia: ' + error.message);
        this.cargando = false;
      });
  }

  onAlertModalClose(): void {
    this.alertModalVisible = false;
    if (!this.isInfoOnly) {
      this.router.navigate(['/principal']);
    }
    this.isInfoOnly = false;
  }

  mostrarInfoUnidad(): void {
    this.alertModalMessage = 'Dependencia judicial que consta en la sentencia (ej.: Unidad Judicial Civil de Loja)';
    this.alertModalVisible = true;
    this.isInfoOnly = true;
  }

  cerrarAlerta(index: number) {
    this.alertas.splice(index, 1);
  }

  validarNumeroProcess(event: KeyboardEvent): boolean {
    if (event.key === ' ') {
      event.preventDefault();
      return false;
    }
    const pattern = /[0-9-]/;
    const inputChar = String.fromCharCode(event.charCode);
    if (!pattern.test(inputChar)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  formatearNumeroProcess(event: any) {
    const input = event.target;
    let valor = input.value;
    valor = valor.replace(/[^0-9-]/g, '');
    this.sentencia.numero_proceso = valor;
  }
}
