import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router, ActivatedRoute } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Observable, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { AuthService, UserData } from '../../services/auth.service';

interface Analisis2 {
  narracion_hechos: string;
  narracion_hechos_calificacion: string;
  narracion_hechos_retroalimentacion: string;
  problema_juridico: string;
  problema_juridico_calificacion: string;
  problema_juridico_retroalimentacion: string;
  cuestiones_subcuestiones: string;
  cuestiones_subcuestiones_calificacion: string;
  cuestiones_subcuestiones_retroalimentacion: string;
  respuesta_cuestiones: string;
  respuesta_cuestiones_calificacion: string;
  respuesta_cuestiones_retroalimentacion: string;
  ratio_obiter: string;
  ratio_obiter_calificacion: string;
  ratio_obiter_retroalimentacion: string;
  solucion_problema: string;
  solucion_problema_calificacion: string;
  solucion_problema_retroalimentacion: string;
  decision: string;
  decision_calificacion: string;
  decision_retroalimentacion: string;
}

@Component({
  selector: 'app-analisis2',
  templateUrl: './analisis2.component.html',
  styleUrls: ['./analisis2.component.css']
})

export class Analisis2Component implements OnInit {
  analisis2Form: FormGroup;
  numero_proceso: string = '';
  asunto: string = '';
  estudiante: string = '';
  docente: string = '';
  saved = false;
  docenteSaved = false;
  dataLoaded = false;
  isDocente = false;

  // Usamos UserData importado y añadimos currentUserData
  currentUser: Observable<UserData | null | undefined> = of(null);
  currentUserData: UserData | null = null;

  calificarState: { [key: string]: boolean } = {};
  selectedButtons: { [key: string]: string } = {};
  cargando: boolean = false; // Nueva propiedad para controlar el estado de carga
  mensajeExito: string = '';
  mostrarMensaje: boolean = false;
  mensajeError: string = '';
  mostrarRetroalimentacion: { [key: string]: boolean } = {};
  private isSubmitting = false

  constructor(
    private fb: FormBuilder,
    private firestore: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    private afAuth: AngularFireAuth
  ) {
    this.analisis2Form = this.fb.group({
      numero_proceso: ['', Validators.required],
      narracion_hechos: ['', Validators.required],
      narracion_hechos_calificacion: [''],
      narracion_hechos_retroalimentacion: [''],
      problema_juridico: ['', Validators.required],
      problema_juridico_calificacion: [''],
      problema_juridico_retroalimentacion: [''],
      cuestiones_subcuestiones: ['', Validators.required],
      cuestiones_subcuestiones_calificacion: [''],
      cuestiones_subcuestiones_retroalimentacion: [''],
      respuesta_cuestiones: ['', Validators.required],
      respuesta_cuestiones_calificacion: [''],
      respuesta_cuestiones_retroalimentacion: [''],
      ratio_obiter: ['', Validators.required],
      ratio_obiter_calificacion: [''],
      ratio_obiter_retroalimentacion: [''],
      solucion_problema: ['', Validators.required],
      solucion_problema_calificacion: [''],
      solucion_problema_retroalimentacion: [''],
      decision: ['', Validators.required],
      decision_calificacion: [''],
      decision_retroalimentacion: [''],
      saved: [false],
      docenteSaved: [false]
    });
  }

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.numero_proceso = params.get('numero_proceso') || '';
      this.asunto = params.get('asunto') || '';
      this.estudiante = params.get('estudiante') || '';
      this.docente = params.get('docente') || '';

      this.analisis2Form.patchValue({
        numero_proceso: this.numero_proceso
      });
      this.loadUserData();
      this.checkDocenteSaved();
      this.checkLockStatus();
    });
  }

  /**
   * Verifica bloqueo de sentencia.
   * Si 'locked' es true en Firestore, se deshabilita el formulario.
   */
  checkLockStatus() {
    this.firestore.collection('locks').doc(this.numero_proceso).valueChanges().subscribe((data: any) => {
      if (data && data.locked) {
        this.disableFormControls(this.analisis2Form); // Disable the form if it's locked
      }
    });
  }

  lockForm() {
    this.firestore.collection('locks').doc(this.numero_proceso).set({ locked: true })
      .then(() => {
        this.disableFormControls(this.analisis2Form); // Disable the form controls
      })
      .catch(error => {
        // console.error("Error locking form: ", error);
      });
  }

  disableFormControls(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.disable(); // Disable the control
      if (control instanceof FormGroup) {
        this.disableFormControls(control); // Recursively disable nested controls
      }
    });
  }

  toggleRetroalimentacion(sectionId: string) {
    this.mostrarRetroalimentacion[sectionId] = !this.mostrarRetroalimentacion[sectionId];
  }

  getRetroalimentacionValue(controlName: string): string {
    return this.analisis2Form.get(controlName)?.value || '';
  }

  // LÓGICA USERDATA ACTUALIZADA
  /**
   * Carga datos de usuario y asigna permisos.
   * Establece `isDocente` si el usuario es administrador o tiene rol 'docente'.
   */
  loadUserData() {
    this.afAuth.user.subscribe(user => {
      if (user) {
        this.currentUser = this.firestore.collection('users').doc<UserData>(user.uid).valueChanges();
        this.currentUser.subscribe(userData => {
          // Asignamos el currentUserData centralizado
          this.currentUserData = userData || null;

          // Verificamos rol de docente o si es admin
          if (userData && (userData.role === 'docente' || userData.isAdmin)) {
            this.isDocente = true;
          }
        });
        this.loadAnalisisData();
      }
    });
  }

  loadAnalisisData() {
    this.firestore.collection<Analisis2>('analisis2', ref => ref.where('numero_proceso', '==', this.numero_proceso))
      .valueChanges().pipe(
        map(analisis2Array => {
          if (analisis2Array && analisis2Array.length > 0) {
            const data: Analisis2 = analisis2Array[0];
            this.analisis2Form.patchValue(data);
            this.updateSelectedButtons(data);
            this.dataLoaded = true;
          } else {
            // Handle case where no data is found
            this.dataLoaded = true;
          }
        })
      ).subscribe();
  }

  updateSelectedButtons(data: Analisis2) {
    const sections = [
      'narracion_hechos', 'problema_juridico', 'cuestiones_subcuestiones',
      'respuesta_cuestiones', 'ratio_obiter', 'solucion_problema', 'decision'
    ];

    sections.forEach(section => {
      const calificacion = data[`${section}_calificacion` as keyof Analisis2];
      if (calificacion === 'Correcto' || calificacion === 'Incorrecto') {
        this.selectedButtons[section] = calificacion;
      }
    });
  }

  /**
   * Guarda los datos de la sección 2 del análisis.
   * Actualiza flags de 'saved' y maneja la recarga de página tras guardar.
   */
  submitForm() {
    this.analisis2Form.patchValue({ saved: true });
    if (this.isDocente) {
      this.analisis2Form.patchValue({ docenteSaved: true });
    }
    const analisisData = this.analisis2Form.value;
    const dataToSave: any = {};
    Object.keys(analisisData).forEach(key => {
      if (!key.endsWith('_showCalificar')) {
        dataToSave[key] = analisisData[key];
      }
    });

    // Quitar validaciones estrictas temporalmente
    // if(this.analisis2Form.valid){
    this.isSubmitting = true;
    this.cargando = true;
    this.firestore.collection('analisis2').doc(this.numero_proceso).set(analisisData)
      .then(() => {
        this.saved = true;
        this.cargando = false;
        this.mostrarMensajeExito('Guardado con éxito');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      })
      .catch(error => {
        // console.error("Error saving document: ", error);
        this.cargando = false;
        this.mostrarMensajeError('Error al guardar. Por favor, intente de nuevo.');
        this.isSubmitting = false;
      });
    // } else {
    //   this.isSubmitting = false;  
    //   this.mostrarMensajeError('Por favor, llene todos los campos antes de guardar');
    // }
  }

  mostrarMensajeExito(mensaje: string) {
    this.mensajeExito = mensaje;
    this.mostrarMensaje = true;
    setTimeout(() => {
      this.mostrarMensaje = false;
      this.mensajeError = '';
    }, 5000);
  }

  mostrarMensajeError(mensaje: string) {
    this.mensajeError = mensaje;
    this.mostrarMensaje = true;
  }

  redirectToAnalisis() {
    this.router.navigate(['/analisis'], {
      queryParams: {
        numero_proceso: this.numero_proceso,
        asunto: this.asunto,
        estudiante: this.estudiante,
        docente: this.docente
      }
    });
  }

  redirectToEvaluacion(event: Event) {
    event.preventDefault();
    // Quitar validaciones estrictas temporalmente
    this.router.navigate(['/evaluacion'], {
      queryParams: {
        numero_proceso: this.numero_proceso,
        asunto: this.asunto,
        estudiante: this.estudiante,
        docente: this.docente
      }
    });
  }

  guardarYContinuar(event: Event) {
    event.preventDefault();

    // Quitar validaciones estrictas temporalmente
    // Primero guardar
    this.submitForm();

    // Luego navegar después de un breve delay para asegurar que se guarde
    setTimeout(() => {
      this.router.navigate(['/evaluacion'], {
        queryParams: {
          numero_proceso: this.numero_proceso,
          asunto: this.asunto,
          estudiante: this.estudiante,
          docente: this.docente
        }
      });
    }, 1500);
  }

  checkDocenteSaved() {
    this.firestore.collection('analisis2').doc(this.numero_proceso).valueChanges()
      .subscribe((data: any) => {
        if (data && data.saved) {
          this.docenteSaved = data.docenteSaved || false;
        }
      });
  }

  toggleCalificar(section: string) {
    this.calificarState[section] = !this.calificarState[section];
  }

  setCalificacion(sectionId: string, calificacion: string) {
    this.analisis2Form.get(sectionId + '_calificacion')?.setValue(calificacion);
    this.selectedButtons[sectionId] = calificacion;
  }

  getCalificacionValue(controlName: string): string {
    const control = this.analisis2Form.get(controlName);
    return control && control.value ? control.value : 'No Calificado';
  }

}