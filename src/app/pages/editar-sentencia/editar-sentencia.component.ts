import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { finalize, map } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';

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
}

@Component({
  selector: 'app-editar-sentencia',
  templateUrl: './editar-sentencia.component.html',
  styleUrls: ['./editar-sentencia.component.css']
})
export class EditarSentenciaComponent implements OnInit {
  sentencia: Sentencia = {
    numero_proceso: '',
    asunto: '',
    nombre_estudiante: '',
    email_estudiante: '',
    nombre_docente: '',
    email_docente: ''
  };

  sentenciaId: string = '';
  archivo: File | null = null;
  archivoMensaje: string = 'Sin subir archivo';
  fileLoaded: boolean = false;
  cargando: boolean = false;
  mensajeExito: string = '';
  mostrarMensajeExito: boolean = false;
  alertas: string[] = [];
  continuaDocente: boolean = true;

  currentUserRole: string | null = null;
  isAdmin: boolean = false;

  // VARIABLES PARA EL BUSCADOR (DOCENTE ACTUAL/PRINCIPAL)
  docentesLista: any[] = [];
  filteredDocentes: any[] = [];
  searchTermDocente: string = '';
  showDropdown: boolean = false;

  // VARIABLES PARA EL BUSCADOR (NUEVO DOCENTE)
  filteredDocentesNuevo: any[] = [];
  searchTermNuevo: string = '';
  showDropdownNuevo: boolean = false;
  nuevoDocente: string = '';
  nuevoEmailDocente: string = '';

  constructor(
    private route: ActivatedRoute,
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private router: Router,
    private afAuth: AngularFireAuth
  ) { }

  ngOnInit(): void {
    this.afAuth.authState.subscribe(user => {
      if (user) {
        this.firestore.collection('users').doc(user.uid).valueChanges().subscribe((userData: any) => {
          this.currentUserRole = userData?.role;
          this.isAdmin = userData?.isAdmin === true;
        });
      }
    });

    this.route.queryParams.subscribe(params => {
      const numeroProceso = params['numero_proceso'];
      const emailEstudiante = params['email_estudiante'];
      const emailDocente = params['email_docente'];

      if (numeroProceso) {
        if (emailEstudiante) {
          this.cargarSentencia(numeroProceso, emailEstudiante, emailDocente);
        } else {
          this.cargarSentenciaPorNumero(numeroProceso);
        }
        // Cargamos docentes y preparamos los filtros
        this.cargarDocentes();
      } else {
        this.alertas.push('No se proporcionó número de proceso para editar.');
        setTimeout(() => this.router.navigate(['/principal']), 3000);
      }
    });
  }

  cargarDocentes(): void {
    this.firestore.collection('users', ref => ref.where('role', '==', 'docente'))
      .valueChanges()
      .pipe(
        map((docentes: any[]) => {
          const docentesActivos = docentes.filter(d => d.isActive !== false);
          return docentesActivos.sort((a, b) => a.name.localeCompare(b.name));
        })
      )
      .subscribe((data) => {
        this.docentesLista = data;
        // Inicializamos las listas filtradas con todos los datos
        this.filteredDocentes = data;
        this.filteredDocentesNuevo = data;
      });
  }

  // LÓGICA BUSCADOR 1 (Docente Principal/Actual)
  filterDocentes() {
    const term = this.searchTermDocente.toLowerCase();
    this.filteredDocentes = this.docentesLista.filter(doc =>
      doc.name.toLowerCase().includes(term) ||
      doc.email.toLowerCase().includes(term)
    );
    this.showDropdown = true;
  }

  selectDocente(docente: any) {
    this.searchTermDocente = docente.name;
    this.sentencia.nombre_docente = docente.name;
    this.sentencia.email_docente = docente.email;
    this.showDropdown = false;
  }

  hideDropdown() {
    setTimeout(() => { this.showDropdown = false; }, 200);
  }

  // LÓGICA BUSCADOR 2 (Nuevo Docente)
  filterDocentesNuevo() {
    const term = this.searchTermNuevo.toLowerCase();
    this.filteredDocentesNuevo = this.docentesLista.filter(doc =>
      doc.name.toLowerCase().includes(term) ||
      doc.email.toLowerCase().includes(term)
    );
    this.showDropdownNuevo = true;
  }

  selectDocenteNuevo(docente: any) {
    this.searchTermNuevo = docente.name;
    this.nuevoDocente = docente.name;
    this.nuevoEmailDocente = docente.email;
    this.showDropdownNuevo = false;
  }

  hideDropdownNuevo() {
    setTimeout(() => { this.showDropdownNuevo = false; }, 200);
  }

  cargarSentenciaPorNumero(numeroProceso: string): void {
    this.firestore.collection('sentencias', ref =>
      ref.where('numero_proceso', '==', numeroProceso).limit(1)
    ).get().subscribe(
      snapshot => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          this.sentenciaId = doc.id;
          this.sentencia = doc.data() as Sentencia;

          // Asignar el nombre al buscador inicial
          this.searchTermDocente = this.sentencia.nombre_docente;

          if (this.sentencia.archivoURL) {
            this.archivoMensaje = 'Archivo actual cargado';
            this.fileLoaded = true;
          }
        } else {
          this.alertas.push(`No se encontró ninguna sentencia con el número: ${numeroProceso}`);
          setTimeout(() => this.router.navigate(['/principal']), 3000);
        }
      },
      error => {
        this.alertas.push('Error al cargar la sentencia: ' + error.message);
      }
    );
  }

  /**
   * Carga una sentencia específica validando permisos.
   * Si se proporciona emailEstudiante, verifica propiedad.
   */
  cargarSentencia(numeroProceso: string, emailEstudiante: string, emailDocente?: string): void {
    const query = this.firestore.collection('sentencias', ref => {
      let baseQuery = ref
        .where('numero_proceso', '==', numeroProceso)
        .where('email_estudiante', '==', emailEstudiante);

      if (emailDocente) {
        baseQuery = baseQuery.where('email_docente', '==', emailDocente);
      }
      return baseQuery.limit(1);
    });

    query.get().subscribe(
      snapshot => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          this.sentenciaId = doc.id;
          this.sentencia = doc.data() as Sentencia;

          // Asignar el nombre al buscador inicial
          this.searchTermDocente = this.sentencia.nombre_docente;

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
      error => {
        this.alertas.push('Error al cargar la sentencia: ' + error.message);
      }
    );
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.archivo = file;
      this.archivoMensaje = `Archivo cargado: ${file.name}`;
      this.fileLoaded = true;
    } else {
      this.archivo = null;
      this.archivoMensaje = 'Sin subir archivo';
      this.fileLoaded = false;
    }
  }

  /**
   * Envía los cambios de la edición.
   * Si es administrador, verifica duplicados globales antes de guardar.
   */
  async submitForm(): Promise<void> {
    this.alertas = [];
    this.cargando = true;

    await new Promise<void>((resolve, reject) => {
      // SOLO ADMIN PUEDE VERIFICAR DUPLICADOS GLOBALES
      // Los estudiantes/docentes no tienen permisos para leer todas las sentencias
      if (!this.isAdmin) {
        this.actualizarSentencia();
        resolve();
        return;
      }

      this.firestore.collection('sentencias', ref =>
        ref.where('numero_proceso', '==', this.sentencia.numero_proceso)
      ).get().subscribe({
        next: (querySnapshot) => {
          const yaExisteAprobada = querySnapshot.docs.some(doc => {
            const data = doc.data() as any;
            return doc.id !== this.sentenciaId && data['estado'] === 'aceptar';
          });

          if (yaExisteAprobada) {
            this.alertas.push('El número de proceso ya fue aprobado en otra sentencia.');
            this.cargando = false;
            resolve(); // Resolvemos pero no actualizamos
            return;
          }

          // Proceder con la actualización si no hay duplicados
          this.procederConActualizacion(resolve);
        },
        error: (err) => {
          console.error('Error al verificar duplicados:', err);
          // Si falla la verificación, intentamos actualizar de todos modos (fail open) o mostramos error
          // En este caso, asumimos que si falló es por permisos, así que procedemos
          this.procederConActualizacion(resolve);
        }
      });
    });
  }

  // Método auxiliar separado para manejar la carga de archivo y update
  private procederConActualizacion(resolve: () => void) {
    if (this.archivo) {
      const filePath = `sentencias/${this.archivo.name}_${Date.now()}`;
      const fileRef = this.storage.ref(filePath);
      const uploadTask = this.storage.upload(filePath, this.archivo);

      uploadTask.snapshotChanges().pipe(
        finalize(() => {
          fileRef.getDownloadURL().subscribe(url => {
            this.sentencia.archivoURL = url;
            this.actualizarSentencia();
            resolve();
          });
        })
      ).subscribe();
    } else {
      this.actualizarSentencia();
      resolve();
    }
  }

  actualizarSentencia(): void {
    const datosActualizados: any = {
      numero_proceso: this.sentencia.numero_proceso,
      asunto: this.sentencia.asunto,
      archivoURL: this.sentencia.archivoURL || null,
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

  cerrarAlerta(index: number): void {
    this.alertas.splice(index, 1);
  }

  validarNumeroProcess(event: KeyboardEvent): boolean {
    const pattern = /[0-9-]/;
    const inputChar = String.fromCharCode(event.charCode);
    if (!pattern.test(inputChar)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  formatearNumeroProcess(event: any): void {
    const input = event.target;
    this.sentencia.numero_proceso = input.value.replace(/[^0-9-]/g, '');
  }
}