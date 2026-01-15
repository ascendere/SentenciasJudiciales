import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService, UserData } from '../../services/auth.service';

interface Section {
  title: string;
  questions: string[];
}

@Component({
  selector: 'app-evaluacion2',
  templateUrl: './evaluacion2.component.html',
  styleUrls: ['./evaluacion2.component.css']
})
export class Evaluacion2Component implements OnInit {
  evaluacion2Form: FormGroup;
  mensajeError: string = '';
  mostrarMensaje: boolean = false;
  mensajeExito: string = '';
  mostrarMensajeExito: boolean = false;
  sections = [
    //SECCION 1: "Fundamentacion normativa correcta"
    {
      id: '1',
      title: 'Fundamentacion normativa correcta de la sentencia, analizaremos si el juez aplicó de manera adecuada las normas jurídicas y si esta aplicación representa la mejor argumentación posible conforme al derecho. *',
      questions: [
        'Parámetro 1: Selección de normas: ¿El juez utiliza disposiciones relevantes de la Constitución y de la ley específicamente?',
        'Parámetro 2: Interpretación de normas: ¿La interpretación del juez es coherente con el contenido de cada norma?',
        'Parámetro 3: Aplicación de las normas: ¿La aplicación de las normas a los hechos es lógica y directa?',
      ]
    },
    //SECCION 2: "Fundamentacion Factica"
    {
      id: '2',
      title: 'Fundamentación fáctica correcta de la sentencia, se revisa si el juez ha realizado una valoración adecuada y exhaustiva de las pruebas y si la fundamentación representa la mejor argumentación posible conforme a los hechos. *',
      questions: [
        'Parámetro 1: Selección y Presentación de las Pruebas: ¿El juez examina y selecciona las pruebas pertinentes para resolver el problema?',
        'Parámetro 2: Análisis y Valoración de las Pruebas: ¿El juez valora cada prueba en relación con su relevancia en el proceso?',
        'Parámetro 3: Conexión de los Hechos con la Decisión: ¿El juez vincula los hechos probados con la decisión final?'
      ]
    },
  ];
  isFormLocked: boolean = false;
  cargando: boolean = false; // Nueva propiedad para controlar el estado de carga
  numero_proceso: string = '';
  asunto: string = '';
  estudiante: string = '';
  docente: string = '';
  saved = false;
  docenteSaved = false;
  selectedButton: string | null = null;
  isDocente = false;

  // Usamos UserData importado y añadimos currentUserData
  currentUser: Observable<UserData | null | undefined> = of(null);
  currentUserData: UserData | null = null;

  calificarState: { [key: string]: boolean } = {};
  calificaciones: { [key: string]: string } = {};
  buttonStates: { [key: string]: string } = {};
  docenteSelections: { [key: string]: boolean } = {};
  studentSelections: { [key: string]: boolean } = {};
  mostrarRetroalimentacion: { [key: string]: boolean } = {};
  private isSubmitting = false

  cdRef: any;
  constructor(
    private fb: FormBuilder,
    private firestore: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    private afAuth: AngularFireAuth,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    this.evaluacion2Form = this.fb.group({
      numero_proceso: [''],
      saved: [false],
      docenteSaved: [false],
      sentenceSubject: this.fb.array([]),
      multicomponent: this.fb.group({ // Grupo anidado
        multiOption: [''] // Cambiado de FormArray a control simple
      }),
      other: this.fb.group({
        otherSubject: ['']
      }),
      sentenceSubject_calificacion: [''],
      sentenceSubject_retroalimentacion: [''],
      judgeAnalysis: [''],
      reasonsNormative: [''],
      reasonsNormative_calificacion: [''],
      reasonsNormative_retroalimentacion: [''],
      finalConclusion: [''],
      finalConclusion_calificacion: [''],
      finalConclusion_retroalimentacion: [''],
    });
  }

  finalizarEvaluacion() {
    // Redirección simple si se decide no bloquear
    this.router.navigate(['/principal']);
  }

  guardarYFinalizar(event: Event) {
    event.preventDefault();

    // Quitar validaciones estrictas temporalmente
    // Mostrar loading y guardar
    this.cargando = true;
    this.submitForm();

    // Mostrar mensaje de éxito después de guardar
    setTimeout(() => {
      this.mostrarMensajeExitoFuncion('Se ha guardado la sección');
      setTimeout(() => {
        this.router.navigate(['/principal']);
      }, 2000);
    }, 1500);
  }

  formatQuestion(question: string): string {
    return question.replace(/(Parámetro \d+:)/, '<strong>$1</strong>');
  }

  isMultiOption(value: string | null): boolean {
    return value === 'MultiComponent' ||
      value === 'MultiCivil' ||
      value === 'MultiPenal';
  }
  initForm() {
    const formGroup: { [key: string]: any } = {
      numero_proceso: [''],
      saved: [false],
      docenteSaved: [false],
      sentenceSubject: [''],
      judgeAnalysis: [''],
      reasonsNormative: [''],
      finalConclusion: [''],
      sentenceSubject_calificacion: [''],
      sentenceSubject_retroalimentacion: [''],
      reasonsNormative_calificacion: [''],
      reasonsNormative_retroalimentacion: [''],
      finalConclusion_calificacion: [''],
      finalConclusion_retroalimentacion: [''],
    };

    this.sections.forEach((section, sIndex) => {
      section.questions.forEach((_, qIndex) => {
        formGroup[`section${sIndex}_question${qIndex}`] = [''];
      });
      formGroup[`section${sIndex}_calificacion`] = [''];
      formGroup[`section${sIndex}_retroalimentacion`] = [''];
    });

    this.evaluacion2Form = this.fb.group(formGroup);
  }

  ngOnInit() {
    this.initForm();
    this.route.queryParamMap.subscribe(params => {
      this.numero_proceso = params.get('numero_proceso') || '';
      this.asunto = params.get('asunto') || '';
      this.estudiante = params.get('estudiante') || '';
      this.docente = params.get('docente') || '';
      this.evaluacion2Form.patchValue({
        numero_proceso: this.numero_proceso
      });
      this.loadEvaluacion2Data(this.numero_proceso);
      this.loadUserData();
      this.checkDocenteSaved();
      setTimeout(() => {
        // console.log('isDocente:', this.isDocente);
        // console.log('saved:', this.evaluacion2Form.get('saved')?.value);
        // console.log('buttonStates:', this.buttonStates);
        // console.log('Form value:', this.evaluacion2Form.value);
        this.checkLockStatus(); // Movemos esto aquí para asegurar que se verifique al cargar
      }, 1000);
    });
  }

  checkLockStatus() {
    this.firestore.collection('locks').doc(this.numero_proceso).valueChanges().subscribe((data: any) => {
      if (data && data.locked) {
        this.evaluacion2Form.disable();
        this.isFormLocked = true;
      } else {
        // Si no está bloqueado en la base, habilitamos el formulario
        if (this.isFormLocked) {
          this.evaluacion2Form.enable();
          this.isFormLocked = false;
        }
      }
    });
  }

  /**
   * Bloquea la sentencia permanentemente para finalizar el proceso de revisión.
   * - Actualiza el flag 'locked' en la colección 'locks'.
   * - Actualiza el flag 'isLocked' en la sentencia para reflejarlo en el listado.
   * - Deshabilita el formulario localmente.
   */
  bloquearSentencia() {
    if (!confirm('¿Está seguro de BLOQUEAR esta sentencia? Ya no se podrán hacer cambios y será redirigido al menú principal.')) return;

    this.cargando = true;
    this.firestore.collection('locks').doc(this.numero_proceso).set({ locked: true })
      .then(async () => {
        // Actualizar flag en sentencias para que se vea en el listado
        const sentenciaQuery = await this.firestore.collection('sentencias', ref => ref.where('numero_proceso', '==', this.numero_proceso)).get().toPromise();
        if (sentenciaQuery && !sentenciaQuery.empty) {
          await sentenciaQuery.docs[0].ref.update({ isLocked: true });
        }

        this.evaluacion2Form.disable();
        this.isFormLocked = true;
        this.cargando = false;
        this.mostrarMensajeExitoFuncion('Sentencia bloqueada correctamente. Redirigiendo...');

        // Redireccionar al principal después de bloquear
        setTimeout(() => {
          this.router.navigate(['/principal']);
        }, 2000);
      })
      .catch(error => {
        // console.error("Error locking form: ", error);
        this.cargando = false;
        this.mostrarMensajeError('Error al bloquear la sentencia');
      });
  }

  // NUEVA FUNCIÓN: Desbloquear Sentencia
  desbloquearSentencia() {
    if (!confirm('¿Desea DESBLOQUEAR la sentencia para editarla nuevamente?')) return;

    this.cargando = true;
    this.firestore.collection('locks').doc(this.numero_proceso).delete()
      .then(async () => {
        // Actualizar flag en sentencias
        const sentenciaQuery = await this.firestore.collection('sentencias', ref => ref.where('numero_proceso', '==', this.numero_proceso)).get().toPromise();
        if (sentenciaQuery && !sentenciaQuery.empty) {
          await sentenciaQuery.docs[0].ref.update({ isLocked: false });
        }

        this.evaluacion2Form.enable();
        this.isFormLocked = false;
        this.cargando = false;
        this.mostrarMensajeExitoFuncion('Sentencia desbloqueada. Puede editar ahora.');
      })
      .catch(error => {
        console.error("Error unlocking form: ", error);
        this.cargando = false;
        this.mostrarMensajeError('Error al desbloquear la sentencia');
      });
  }

  disableFormControls(formGroup: FormGroup | FormArray) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control instanceof FormGroup || control instanceof FormArray) {
        this.disableFormControls(control);
      } else {
        control?.disable();
      }
    });
  }

  // LÓGICA USERDATA ACTUALIZADA
  loadUserData() {
    this.afAuth.user.subscribe(user => {
      if (user) {
        this.firestore.collection('users').doc(user.uid).valueChanges().subscribe((userData: any) => {
          // Guardamos el usuario centralizado
          this.currentUserData = userData as UserData;
          // Verificamos rol de docente o si es admin (para permisos)
          this.isDocente = userData && (userData.role === 'docente' || userData.isAdmin === true);
        });
      }
    });
  }

  /**
   * Guarda la evaluación de motivación correcta.
   * Si es docente, marca la revisión.
   */
  submitForm() {
    // Quitar validaciones estrictas temporalmente
    // if (this.evaluacion2Form.valid) {
    this.isSubmitting = true;
    this.cargando = true;
    const analisisData = this.evaluacion2Form.value;
    analisisData.saved = true;
    this.firestore.collection('evaluacion2').doc(this.numero_proceso).set(analisisData)
      .then(() => {
        if (this.isDocente) {
          this.docenteSaved = true;
        }
        this.cargando = false;
        this.saved = true;
        this.evaluacion2Form.patchValue({ saved: true });
        // console.log('Form submitted and saved:', analisisData);
        this.mostrarMensajeExitoFuncion('Se ha guardado la sección');
        setTimeout(() => {
          // Recargar solo si no vamos a redirigir, en este caso permitimos seguir
          window.location.reload();
        }, 1000);
      })
      .catch(error => {
        // console.error("Error saving document: ", error);
        this.cargando = false;
      });
    // } else {
    //   this.isSubmitting = false;
    //   this.mostrarMensajeError('Por favor, llene todos los campos antes de guardar.');
    // }
  }

  mostrarMensajeError(mensaje: string) {
    this.mensajeError = mensaje;
    this.mostrarMensaje = true;
  }

  mostrarMensajeExitoFuncion(mensaje: string) {
    this.mensajeExito = mensaje;
    this.mostrarMensajeExito = true;
    this.cargando = false;
    setTimeout(() => {
      this.mostrarMensajeExito = false;
      this.mensajeExito = '';
    }, 3000);
  }

  loadCalificaciones(data: any) {
    this.buttonStates = {}; // Reinicia buttonStates
    this.updateButtonStates(data);
    this.changeDetectorRef.detectChanges(); // Forzar actualización de la vista
  }

  updateButtonStates(data: any) {
    Object.keys(data).forEach(key => {
      if (key.endsWith('_calificacion')) {
        this.buttonStates[key] = data[key];
      }
    });
  }

  loadEvaluacion2Data(numero_proceso: string) {
    this.firestore.collection('evaluacion2').doc(numero_proceso).get().subscribe(
      (doc) => {
        if (doc.exists) {
          const data = doc.data() as any;
          this.evaluacion2Form.patchValue(data);
          this.updateButtonStates(data);
        }
      },
      (error) => {
        // console.error("Error loading document: ", error);
      }
    );
  }

  updateFormArray(controlName: string, values: any[]) {
    const formArray = this.evaluacion2Form.get(controlName) as FormArray;
    formArray.clear();
    if (values && Array.isArray(values)) {
      values.forEach(value => {
        formArray.push(this.fb.control(value));
      });
    }
  }

  checkDocenteSaved() {
    this.firestore.collection('evaluacion2').doc(this.numero_proceso).valueChanges()
      .subscribe((data: any) => {
        if (data && data.saved) {
          this.docenteSaved = data.docenteSaved || false;
        }
      });
  }

  setFormArrayValues(controlName: string, values: any[]) {
    const formArray = this.evaluacion2Form.get(controlName) as FormArray;
    if (values) {
      values.forEach(value => {
        formArray.push(this.fb.control(value));
      });
    }
  }

  setSentenceSubject(subjects: string[]) {
    const sentenceSubject = this.evaluacion2Form.get('sentenceSubject') as FormArray;
    subjects.forEach(subject => {
      sentenceSubject.push(this.fb.control(subject));
    });
  }

  setMultiOption(options: string[]) {
    const multiOption = this.evaluacion2Form.get('multicomponent.multiOption') as FormArray;
    options.forEach(option => {
      multiOption.push(this.fb.control(option));
    });
  }

  toggleCalificar(section: string) {
    this.calificarState[section] = !this.calificarState[section];
  }

  toggleCalificar2(key: string) {
    this.calificarState[key] = !this.calificarState[key];
  }

  setCalificacion(controlName: string, value: string) {
    this.evaluacion2Form.get(controlName)?.setValue(value);
    this.buttonStates[controlName] = value;
    this.saveFormChanges();
    this.changeDetectorRef.detectChanges();
  }

  setCalificacion2(controlName: string, value: string) {
    this.evaluacion2Form.get(controlName)?.setValue(value);
    this.buttonStates[controlName] = value;
    this.saveFormChanges();
    this.changeDetectorRef.detectChanges();
  }

  isButtonSelected2(controlName: string, value: string): boolean {
    return this.evaluacion2Form.get(controlName)?.value === value;
  }


  isButtonSelected(controlPath: string, calificacion: string): boolean {
    return this.buttonStates[controlPath] === calificacion;
  }

  getCalificacionValue(controlName: string): string {
    const value = this.evaluacion2Form.get(controlName)?.value;
    // console.log(`Calificación para ${controlName}:`, value); // Para depuración
    return value ? value : 'No Calificado';
  }

  getRetroalimentacionValue(controlName: string): string {
    const value = this.evaluacion2Form.get(controlName)?.value;
    return value || 'Sin retroalimentación';
  }

  redirectToEvaluacion() {
    this.router.navigate(['/evaluacion'], {
      queryParams: {
        numero_proceso: this.numero_proceso,
        asunto: this.asunto,
        estudiante: this.estudiante,
        docente: this.docente
      }
    });
  }

  saveFormChanges() {
    const formData = this.evaluacion2Form.value;
    formData.saved = true;
    this.firestore.collection('evaluacion2').doc(this.numero_proceso).update(formData)
      .then(() => {
        this.evaluacion2Form.patchValue({ saved: true });
      });
  }

  toggleRetroalimentacion(sectionId: string) {
    this.mostrarRetroalimentacion[sectionId] = !this.mostrarRetroalimentacion[sectionId];
  }
}