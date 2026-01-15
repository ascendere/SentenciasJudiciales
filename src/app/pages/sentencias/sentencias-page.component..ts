import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { Router } from '@angular/router';

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
    isLocked: false
  };

  docentes$: Observable<any[]> = new Observable<any[]>();
  selectedFile: File | null = null;
  archivoMensaje: string = 'Sin subir archivo';
  alertas: string[] = [];
  mensajeExito: string = '';
  mostrarMensajeExito: boolean = false;
  archivo: File | null = null;

  // VARIABLES PARA EL BUSCADOR DE DOCENTES
  docentesLista: any[] = [];
  filteredDocentes: any[] = [];
  searchTermDocente: string = '';
  showDropdown: boolean = false;

  // VARIABLES DE ROL
  isAdmin: boolean = false;
  currentUserRole: string | null = null;

  constructor(
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.afAuth.authState.subscribe(user => {
      if (user) {
        this.firestore.collection('users').doc(user.uid).valueChanges().subscribe((userData: any) => {
          this.sentencia.nombre_estudiante = userData.name;
          this.sentencia.email_estudiante = userData.email;
          // Guardamos si es admin o el rol
          this.currentUserRole = userData.role;
          this.isAdmin = userData.isAdmin === true;
        });
      }
    });

    // CAMBIO: Quitamos el filtro de Firestore para 'isActive' porque el campo puede no existir.
    // Traemos todos los docentes y filtramos en memoria.
    this.firestore
      .collection('users', ref => ref.where('role', '==', 'docente'))
      .valueChanges()
      .pipe(
        map((docentes: any[]) => {
          // Filtro en memoria: Si no tiene campo, es activo. Solo excluimos si es explícitamente false.
          const docentesActivos = docentes.filter(d => d.isActive !== false);
          return docentesActivos.sort((a, b) => a.name.localeCompare(b.name));
        })
      )
      .subscribe(data => {
        this.docentesLista = data;
        this.filteredDocentes = data; // Inicializar filtrados con todos los activos
      });

    // También actualizamos el observable para que sea consistente
    this.docentes$ = this.firestore
      .collection('users', ref => ref.where('role', '==', 'docente'))
      .valueChanges()
      .pipe(
        map((docentes: any[]) => {
          // Misma lógica de filtrado
          const docentesActivos = docentes.filter(d => d.isActive !== false);
          return docentesActivos.sort((a, b) => a.name.localeCompare(b.name));
        })
      );

    // CAMBIO: Ahora obtenemos el periodo real de la base de datos
    this.obtenerPeriodoActivoDesdeBD();
  }

  // LÓGICA DEL BUSCADOR
  filterDocentes() {
    const term = this.searchTermDocente.toLowerCase();
    this.filteredDocentes = this.docentesLista.filter(doc =>
      doc.name.toLowerCase().includes(term) ||
      doc.email.toLowerCase().includes(term)
    );
    this.showDropdown = true;
  }

  selectDocente(docente: any) {
    this.searchTermDocente = docente.name; // Mostrar nombre en el input
    this.sentencia.nombre_docente = docente.name;
    this.sentencia.email_docente = docente.email; // Asignar correo automáticamente
    this.showDropdown = false;
  }

  hideDropdown() {
    // Pequeño delay para permitir el click en la opción antes de que desaparezca
    setTimeout(() => {
      this.showDropdown = false;
    }, 200);
  }

  /**
   * Obtiene el periodo académico activo desde la base de datos.
   * Esto asegura que la sentencia se vincule al ciclo correcto.
   */
  obtenerPeriodoActivoDesdeBD() {
    this.firestore.collection('periodoAcademico', ref =>
      ref.where('activo', '==', true).limit(1)
    ).get().subscribe(snapshot => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as any;
        this.sentencia.periodo_academico = data.nombre; // Ej: "octubre 2025 - febrero 2026"
        // console.log('Periodo activo asignado:', this.sentencia.periodo_academico);
      } else {
        console.warn('No hay ningún periodo activo configurado en el panel de administración.');
        this.sentencia.periodo_academico = 'Periodo No Definido';
      }
    }, error => {
      console.error('Error al obtener el periodo:', error);
    });
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

  /**
   * Valida y envía el formulario de nueva sentencia.
   * Realiza validaciones asíncronas:
   * 1. Que el números de proceso no esté duplicado y aprobado.
   * 2. Que exista un docente y archivo seleccionado.
   */
  submitForm(): void {
    this.alertas = [];
    this.cargando = true;

    // VALIDACIÓN ESTRICTA DEL NÚMERO DE PROCESO
    if (!this.sentencia.numero_proceso || this.sentencia.numero_proceso.trim() === '') {
      this.alertas.push('El número de proceso es obligatorio.');
      this.cargando = false;
      return;
    }

    // Validación del periodo
    if (!this.sentencia.periodo_academico || this.sentencia.periodo_academico === 'Periodo No Definido') {
      this.alertas.push('Error: No hay un periodo académico activo en el sistema. Contacte al administrador.');
      this.cargando = false;
      return;
    }

    const checkArchivo = new Promise<void>((resolve) => {
      if (!this.archivo) {
        this.alertas.push('Debe seleccionar un archivo PDF.');
      }
      resolve();
    });

    const checkDocente = new Promise<void>((resolve) => {
      if (!this.sentencia.nombre_docente || !this.sentencia.email_docente) {
        this.alertas.push('Debe seleccionar un docente válido de la lista.');
      }
      resolve();
    });

    const checkNumeroProceso = new Promise<void>((resolve) => {
      this.firestore.collection('sentencias', ref =>
        ref.where('numero_proceso', '==', this.sentencia.numero_proceso)
      ).get().subscribe(querySnapshot => {
        const yaExisteAprobada = querySnapshot.docs.some(doc => (doc.data() as any)['estado'] === 'aceptar');
        if (yaExisteAprobada) {
          this.alertas.push('El número de proceso ya fue aprobado y no se puede volver a subir.');
        }
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

  /**
   * Sube el archivo PDF a Firebase Storage y guarda los metadatos en Firestore.
   */
  private uploadFileAndSaveSentencia(): void {
    const filePath = `sentencias/${this.archivo!.name}_${Date.now()}`;
    const fileRef = this.storage.ref(filePath);
    const uploadTask = this.storage.upload(filePath, this.archivo);

    uploadTask.snapshotChanges().pipe(
      finalize(() => {
        fileRef.getDownloadURL().subscribe(url => {
          this.sentencia.archivoURL = url;

          // Guardamos fecha de creación para ordenamiento futuro
          const sentenciaAGuardar = {
            ...this.sentencia,
            fecha_creacion: new Date(),
            fecha_actualizacion: new Date()
          };

          this.firestore.collection('sentencias').add(sentenciaAGuardar)
            .then(() => {
              console.log('Sentencia added successfully!');
              this.mensajeExito = 'Sentencia guardada';
              this.mostrarMensajeExito = true;
              this.cargando = false;
              setTimeout(() => {
                this.router.navigate(['/principal']);
              }, 2000);
            })
            .catch(error => {
              console.error('Error adding sentencia: ', error);
              this.alertas.push('Error al guardar la sentencia.');
              this.cargando = false;
            });
        });
      })
    ).subscribe();
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
