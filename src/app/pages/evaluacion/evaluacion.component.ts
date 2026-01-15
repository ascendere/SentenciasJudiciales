import { ChangeDetectorRef, Component, type OnInit, HostListener } from "@angular/core"
import { FormBuilder, FormGroup, FormControl, FormArray } from "@angular/forms"
import { AngularFirestore } from "@angular/fire/compat/firestore"
import { AngularFireAuth } from "@angular/fire/compat/auth"
import { ActivatedRoute, Router } from "@angular/router"
import { type Observable, of } from "rxjs"
import { AuthService, UserData } from '../../services/auth.service';

@Component({
  selector: "app-evaluacion",
  templateUrl: "./evaluacion.component.html",
  styleUrls: ["./evaluacion.component.css"],
})
export class EvaluacionComponent implements OnInit {
  buttonStates: { [key: string]: string } = {}
  evaluacionForm: FormGroup
  numero_proceso = ""
  asunto = ""
  estudiante = ""
  docente = ""
  saved = false
  docenteSaved = false
  isDocente = false
  mostrarMensaje = false
  calificaciones: { [key: string]: string } = {}

  // Usamos UserData importado y añadimos currentUserData
  currentUser: Observable<UserData | null | undefined> = of(null)
  currentUserData: UserData | null = null;

  selectedButtons: { [key: string]: string } = {}
  calificarState: { [key: string]: boolean } = {}
  cargando = false
  mostrarRetroalimentacion: { [key: string]: boolean } = {}
  mensajeError = ""
  private isSubmitting = false

  // NUEVAS PROPIEDADES PARA CONTROL DE ESTUDIANTES
  hasUnsavedChanges = false
  initialFormValue: any = null
  showValidationErrors = false
  incompleteSections: string[] = []

  constructor(
    private fb: FormBuilder,
    private firestore: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute,
    private afAuth: AngularFireAuth,
    private changeDetectorRef: ChangeDetectorRef,
    // Inyectamos AuthService si se necesita lógica adicional, aunque aquí usamos firestore directo como en el ejemplo
    private authService: AuthService
  ) {
    this.evaluacionForm = this.fb.group({
      numero_proceso: new FormControl(""),
      saved: [false],
      docenteSaved: [false],
      motivationType: new FormControl(""),
      motivationType_calificacion: new FormControl(""),
      motivationType_retroalimentacion: new FormControl(""),

      // Campos para la pregunta final de déficit de motivación
      finalMotivationDeficit: new FormControl(""),
      finalMotivationReasons: new FormControl(""),
      finalMotivation_calificacion: new FormControl(""),
      finalMotivation_retroalimentacion: new FormControl(""),

      nonexistinence: this.fb.group({
        lackFoundationNormative: new FormControl(""),
        reasonsNormative: new FormControl(""),
        normative_calificacion: new FormControl(""),
        normative_retroalimentacion: new FormControl(""),
        lackFoundationFactual: new FormControl(""),
        reasonsFactual: new FormControl(""),
        factual_calificacion: new FormControl(""),
        factual_retroalimentacion: new FormControl(""),
      }),
      insufficiency: this.fb.group({
        lackFoundationNormative: new FormControl(""),
        reasonsNormative: new FormControl(""),
        normative_calificacion: new FormControl(""),
        normative_retroalimentacion: new FormControl(""),
        lackFoundationFactual: new FormControl(""),
        reasonsFactual: new FormControl(""),
        factual_calificacion: new FormControl(""),
        factual_retroalimentacion: new FormControl(""),
      }),
      appearance: this.fb.group({
        appearanceReason: new FormControl(""),
        motivationalHabit: new FormControl(""),
        motivationalHabit_calificacion: new FormControl(""),
        motivationalHabit_retroalimentacion: new FormControl(""),
        incoherence: this.fb.group({
          existsLogicalNormative: new FormControl(""),
          reasonsLogicaNormative: new FormControl(""),
          logicaNormative_calificacion: new FormControl(""),
          logicaNormative_retroalimentacion: new FormControl(""),
          existsDecisionalNormative: new FormControl(""),
          reasonsDecisionalNormative: new FormControl(""),
          decisionalNormative_calificacion: new FormControl(""),
          decisionalNormative_retroalimentacion: new FormControl(""),
          existsLogicalFactual: new FormControl(""),
          reasonsLogicalFactual: new FormControl(""),
          logicalFactual_calificacion: new FormControl(""),
          logicalFactual_retroalimentacion: new FormControl(""),
          existsDecisionalFactual: new FormControl(""),
          reasonsDecisionalFactual: new FormControl(""),
          decisionalFactual_calificacion: new FormControl(""),
          decisionalFactual_retroalimentacion: new FormControl(""),
          lackMotivation: new FormControl(""),
          reasonsMotivation: new FormControl(""),
          motivation_calificacion: new FormControl(""),
          motivation_retroalimentacion: new FormControl(""),
        }),
        inatinence: this.fb.group({
          existsInatinenceJuridical: new FormControl(""),
          reasonsInatinenceJuridical: new FormControl(""),
          inatinenceJuridical_calificacion: new FormControl(""),
          inatinenceJuridical_retroalimentacion: new FormControl(""),
          existsInatinenceFactual: new FormControl(""),
          reasonsInatinenceFactual: new FormControl(""),
          inatinenceFactual_calificacion: new FormControl(""),
          inatinenceFactual_retroalimentacion: new FormControl(""),
        }),
        incomprehensibility: this.fb.group({
          existsIncomprehensibilityJuridical: new FormControl(""),
          reasonsIncomprehensibilityJuridical: new FormControl(""),
          incomprehensibilityJuridical_calificacion: new FormControl(""),
          incomprehensibilityJuridical_retroalimentacion: new FormControl(""),
          existsIncomprehensibilityFactual: new FormControl(""),
          reasonsIncomprehensibilityFactual: new FormControl(""),
          incomprehensibilityFactual_calificacion: new FormControl(""),
          incomprehensibilityFactual_retroalimentacion: new FormControl(""),
        }),
        incongruity: this.fb.group({
          existsIncongruityNormativeParticipants: new FormControl(""),
          reasonsIncongruityNormativeParticipants: new FormControl(""),
          normativeParticipants_calificacion: new FormControl(""),
          normativeParticipants_retroalimentacion: new FormControl(""),
          existsIncongruityNormativeLaw: new FormControl(""),
          reasonsIncongruityNormativeLaw: new FormControl(""),
          normativeLaw_calificacion: new FormControl(""),
          normativeLaw_retroalimentacion: new FormControl(""),
          existsIncongruityFactualParticipants: new FormControl(""),
          reasonsIncongruityFactualParticipants: new FormControl(""),
          factualParticipants_calificacion: new FormControl(""),
          factualParticipants_retroalimentacion: new FormControl(""),
          existsIncongruityFactualLaw: new FormControl(""),
          reasonsIncongruityFactualLaw: new FormControl(""),
          factualLaw_calificacion: new FormControl(""),
          factualLaw_retroalimentacion: new FormControl(""),
        }),
      }),
    })

    // Suscribirse a cambios en motivationType
    this.evaluacionForm.get("motivationType")?.valueChanges.subscribe((value) => {
      this.handleMotivationTypeChange(value)
    })

    // Suscribirse a cambios en motivationalHabit para debugging
    this.evaluacionForm.get("appearance.motivationalHabit")?.valueChanges.subscribe((value) => {
      console.log("Motivational habit changed to:", value)
      this.changeDetectorRef.detectChanges()
    })

    // Detectar cambios en el formulario para estudiantes
    this.evaluacionForm.valueChanges.subscribe(() => {
      if (!this.isDocente && this.initialFormValue) {
        this.detectUnsavedChanges()
      }
    })
  }

  sectionErrors: { [key: string]: string[] } = {
    motivationType: [],
    nonexistence: [],
    insufficiency: [],
    appearance: [],
    finalMotivation: [],
  }

  // Detectar cambios no guardados
  private detectUnsavedChanges() {
    const currentValue = this.evaluacionForm.getRawValue()
    this.hasUnsavedChanges = JSON.stringify(currentValue) !== JSON.stringify(this.initialFormValue)
  }

  // Guardar estado inicial del formulario
  private saveInitialFormState() {
    this.initialFormValue = this.evaluacionForm.getRawValue()
    this.hasUnsavedChanges = false
  }

  // Prevenir navegación si hay cambios no guardados
  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (!this.isDocente && this.hasUnsavedChanges) {
      $event.returnValue = 'Tiene cambios sin guardar. ¿Está seguro de que desea salir?'
    }
  }

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.numero_proceso = params["numero_proceso"] || ""
      this.asunto = params["asunto"] || ""
      this.estudiante = params["estudiante"] || ""
      this.docente = params["docente"] || ""
      this.evaluacionForm.patchValue({
        numero_proceso: this.numero_proceso,
      })
      this.loadUserData()
      this.checkSavedStatus()
      this.checkDocenteSaved()
      setTimeout(() => {
        this.checkLockStatus()
      }, 1000)
      this.loadFormData()
    })
    this.changeDetectorRef.detectChanges()
  }

  /**
   * Valida si el estudiante ha completado TOTALMENTE el formulario.
   * La lógica exige:
   * 1. Selección de un Tipo de Motivación.
   * 2. Completitud de TODAS las secciones (Inexistencia, Insuficiencia, Apariencia), independiente de la selección principal.
   * 3. Completitud de la evaluación final.
   */
  isFormCompleteForStudent(): boolean {
    const motivationType = this.evaluacionForm.get('motivationType')?.value

    if (!motivationType) {
      return false
    }

    // Verificar que TODAS las secciones estén completas, no solo la seleccionada
    const allSectionsComplete = this.areAllSectionsComplete()
    const finalComplete = this.isFinalMotivationComplete()

    return allSectionsComplete && finalComplete
  }

  // Verificar que TODAS las secciones estén completas (inexistencia, insuficiencia Y apariencia)
  areAllSectionsComplete(): boolean {
    const motivationType = this.evaluacionForm.get('motivationType')?.value

    if (!motivationType) {
      return false
    }

    // Verificar TODAS las secciones, no solo la seleccionada
    const inexistenciaComplete = this.isNonexistenceComplete()
    const insuficienciaComplete = this.isInsufficiencyComplete()
    const aparienciaComplete = this.isAppearanceComplete()

    // TODAS las secciones deben estar completas
    return inexistenciaComplete && insuficienciaComplete && aparienciaComplete
  }

  // Verificar si la evaluación final debe estar disponible
  isFinalEvaluationEnabled(): boolean {
    if (this.isDocente) {
      return true // Los docentes siempre pueden acceder
    }

    // Para estudiantes, solo si TODAS las secciones están completas
    return this.areAllSectionsComplete()
  }

  // Obtener mensaje específico para evaluación final bloqueada
  getFinalEvaluationBlockedMessage(): string {
    const motivationType = this.evaluacionForm.get('motivationType')?.value

    if (!motivationType) {
      return "Debe seleccionar un tipo de motivación antes de acceder a la evaluación final"
    }

    if (!this.areAllSectionsComplete()) {
      return "Debe completar TODAS las secciones (Inexistencia, Insuficiencia y Apariencia) antes de acceder a la Evaluación Final"
    }

    return ""
  }

  // Verificar si la evaluación final está completa
  private isFinalMotivationComplete(): boolean {
    const finalDeficit = this.evaluacionForm.get('finalMotivationDeficit')?.value
    const finalReasons = this.evaluacionForm.get('finalMotivationReasons')?.value
    return !!(finalDeficit && finalReasons)
  }

  // Obtener mensaje de secciones incompletas
  getIncompleteSectionsMessage(): string {
    if (!this.areAllSectionsComplete()) {
      return "Debe completar TODAS las secciones (Inexistencia, Insuficiencia y Apariencia) antes de continuar con la Evaluación Final"
    }
    return ""
  }

  // Obtener secciones incompletas - REVISA TODAS LAS SECCIONES
  getIncompleteSectionsForStudent(): string[] {
    const incomplete: string[] = []
    const motivationType = this.evaluacionForm.get('motivationType')?.value

    // Verificar tipo de motivación
    if (!motivationType) {
      incomplete.push('Tipo de Motivación')
    }

    // Verificar TODAS las secciones, no solo la seleccionada
    if (!this.isNonexistenceComplete()) {
      incomplete.push('Inexistencia')
    }
    if (!this.isInsufficiencyComplete()) {
      incomplete.push('Insuficiencia')
    }
    if (!this.isAppearanceComplete()) {
      incomplete.push('Apariencia')
    }

    // Verificar evaluación final solo si todas las secciones están completas
    if (this.areAllSectionsComplete() && !this.isFinalMotivationComplete()) {
      incomplete.push('Evaluación Final')
    }

    return incomplete
  }

  getDetailedIncompleteSections()
    : string {
    const motivationType = this.evaluacionForm.get("motivationType")?.value
    const details: string[] = []

    if (!motivationType) {
      details.push("• Seleccione un tipo de motivación")
      return details.join('\n')
    }

    // Verificar TODAS las secciones principales
    // Inexistencia
    const nonexistence = this.evaluacionForm.get("nonexistinence")?.value
    if (!nonexistence?.lackFoundationNormative || !nonexistence?.reasonsNormative) {
      details.push("• Inexistencia: Complete la sección completa")
    }
    if (!nonexistence?.lackFoundationFactual || !nonexistence?.reasonsFactual) {
      details.push("• Inexistencia: Complete fundamentación fáctica")
    }

    // Insuficiencia
    const insufficiency = this.evaluacionForm.get("insufficiency")?.value
    if (!insufficiency?.lackFoundationNormative || !insufficiency?.reasonsNormative) {
      details.push("• Insuficiencia: Complete la sección completa")
    }
    if (!insufficiency?.lackFoundationFactual || !insufficiency?.reasonsFactual) {
      details.push("• Insuficiencia: Complete fundamentación fáctica")
    }

    // Apariencia - TODAS las subsecciones
    const appearance = this.evaluacionForm.get("appearance")?.value
    if (!appearance?.motivationalHabit) {
      details.push("• Apariencia: Seleccione un vicio motivacional")
    }

    // Agregar detalles de TODAS las subsecciones de Apariencia
    const appearanceDetails = this.getAppearanceSubsectionDetails(appearance?.motivationalHabit || "")
    details.push(...appearanceDetails)

    // Evaluación final solo si todas las secciones están completas
    if (this.areAllSectionsComplete()) {
      const finalDeficit = this.evaluacionForm.get("finalMotivationDeficit")?.value
      const finalReasons = this.evaluacionForm.get("finalMotivationReasons")?.value

      if (!finalDeficit) {
        details.push("• Evaluación Final: Complete la pregunta sobre déficit de motivación")
      }
      if (!finalReasons) {
        details.push("• Evaluación Final: Ingrese las razones del déficit de motivación")
      }
    } else {
      details.push(
        "• Complete TODAS las secciones (Inexistencia, Insuficiencia y Apariencia completa) antes de acceder a la Evaluación Final",
      )
    }

    return details.join('\n')
  }


  // Obtener resumen completo de progreso
  getProgressSummary(): { completed: number, total: number, sections: any[] } {
    const motivationType = this.evaluacionForm.get('motivationType')?.value
    let sections: Array<{
      name: string;
      completed: boolean;
      required: boolean;
      type: string;
      active?: boolean;
      details?: any;
      subsections?: any;
    }> = [
        {
          name: 'Tipo de Motivación',
          completed: !!motivationType,
          required: true,
          type: 'main'
        }
      ]

    // SIEMPRE mostrar todas las secciones principales
    sections.push({
      name: 'Inexistencia',
      completed: this.isNonexistenceComplete(),
      required: true,
      active: true,
      type: 'section',
      details: this.getNonexistenceProgressDetails()
    })

    sections.push({
      name: 'Insuficiencia',
      completed: this.isInsufficiencyComplete(),
      required: true,
      active: true,
      type: 'section',
      details: this.getInsufficiencyProgressDetails()
    })

    // Para Apariencia, mostrar también las subsecciones
    const appearanceSection = {
      name: 'Apariencia',
      completed: this.isAppearanceComplete(),
      required: true,
      active: true,
      type: 'section',
      details: this.getAppearanceProgressDetails(),
      subsections: this.getAppearanceSubsectionsProgress()
    }
    sections.push(appearanceSection)

    // Evaluación final solo disponible cuando secciones principales están completas
    sections.push({
      name: 'Evaluación Final',
      completed: this.isFinalMotivationComplete(),
      required: this.areAllSectionsComplete(), // Solo requerida si las secciones están completas
      active: this.isFinalEvaluationEnabled(),
      type: 'final',
      details: this.getFinalMotivationProgressDetails()
    })

    const completed = sections.filter(s => s.completed && s.required).length
    const total = sections.filter(s => s.required).length

    return { completed, total, sections }
  }

  // Obtener detalles de progreso de Inexistencia
  private getNonexistenceProgressDetails(): any[] {
    const nonexistence = this.evaluacionForm.get('nonexistinence')?.value
    return [
      {
        name: 'Fundamentación Normativa',
        completed: !!(nonexistence?.lackFoundationNormative && nonexistence?.reasonsNormative)
      },
      {
        name: 'Fundamentación Fáctica',
        completed: !!(nonexistence?.lackFoundationFactual && nonexistence?.reasonsFactual)
      }
    ]
  }

  // Obtener detalles de progreso de Insuficiencia
  private getInsufficiencyProgressDetails(): any[] {
    const insufficiency = this.evaluacionForm.get('insufficiency')?.value
    return [
      {
        name: 'Fundamentación Normativa',
        completed: !!(insufficiency?.lackFoundationNormative && insufficiency?.reasonsNormative)
      },
      {
        name: 'Fundamentación Fáctica',
        completed: !!(insufficiency?.lackFoundationFactual && insufficiency?.reasonsFactual)
      }
    ]
  }

  // Obtener detalles de progreso de Apariencia
  private getAppearanceProgressDetails(): any[] {
    const appearance = this.evaluacionForm.get('appearance')?.value
    return [
      {
        name: 'Vicio Motivacional Seleccionado',
        completed: !!appearance?.motivationalHabit
      }
    ]
  }

  // Obtener progreso de subsecciones de Apariencia
  private getAppearanceSubsectionsProgress(): any[] {
    const appearance = this.evaluacionForm.get('appearance')?.value
    const subsections = [
      {
        name: 'Incoherencia',
        completed: this.isIncoherenceComplete(),
        active: appearance?.motivationalHabit === 'incoherence',
        required: appearance?.motivationalHabit === 'incoherence',
        details: this.getIncoherenceProgressDetails()
      },
      {
        name: 'Inatinencia',
        completed: this.isInatinenceComplete(),
        active: appearance?.motivationalHabit === 'inatinence',
        required: appearance?.motivationalHabit === 'inatinence',
        details: this.getInatinenceProgressDetails()
      },
      {
        name: 'Incomprensibilidad',
        completed: this.isIncomprehensibilityComplete(),
        active: appearance?.motivationalHabit === 'incomprehensibility',
        required: appearance?.motivationalHabit === 'incomprehensibility',
        details: this.getIncomprehensibilityProgressDetails()
      },
      {
        name: 'Incongruencia',
        completed: this.isIncongruityComplete(),
        active: appearance?.motivationalHabit === 'incongruity',
        required: appearance?.motivationalHabit === 'incongruity',
        details: this.getIncongruityProgressDetails()
      }
    ]

    return subsections
  }

  // Obtener detalles de progreso de Incoherencia
  private getIncoherenceProgressDetails(): any[] {
    const incoherence = this.evaluacionForm.get('appearance.incoherence')?.value
    return [
      {
        name: 'Incoherencia Lógica Normativa',
        completed: !!(incoherence?.existsLogicalNormative && incoherence?.reasonsLogicaNormative)
      },
      {
        name: 'Incoherencia Decisional Normativa',
        completed: !!(incoherence?.existsDecisionalNormative && incoherence?.reasonsDecisionalNormative)
      },
      {
        name: 'Incoherencia Lógica Fáctica',
        completed: !!(incoherence?.existsLogicalFactual && incoherence?.reasonsLogicalFactual)
      },
      {
        name: 'Incoherencia Decisional Fáctica',
        completed: !!(incoherence?.existsDecisionalFactual && incoherence?.reasonsDecisionalFactual)
      }
    ]
  }

  // Obtener detalles de progreso de Inatinencia
  private getInatinenceProgressDetails(): any[] {
    const inatinence = this.evaluacionForm.get('appearance.inatinence')?.value
    return [
      {
        name: 'Fundamentación Jurídica',
        completed: !!(inatinence?.existsInatinenceJuridical && inatinence?.reasonsInatinenceJuridical)
      },
      {
        name: 'Fundamentación Fáctica',
        completed: !!(inatinence?.existsInatinenceFactual && inatinence?.reasonsInatinenceFactual)
      }
    ]
  }

  // Obtener detalles de progreso de Incomprensibilidad
  private getIncomprehensibilityProgressDetails(): any[] {
    const incomprehensibility = this.evaluacionForm.get('appearance.incomprehensibility')?.value
    return [
      {
        name: 'Fundamentación Jurídica',
        completed: !!(incomprehensibility?.existsIncomprehensibilityJuridical && incomprehensibility?.reasonsIncomprehensibilityJuridical)
      },
      {
        name: 'Fundamentación Fáctica',
        completed: !!(incomprehensibility?.existsIncomprehensibilityFactual && incomprehensibility?.reasonsIncomprehensibilityFactual)
      }
    ]
  }

  // Obtener detalles de progreso de Incongruencia
  private getIncongruityProgressDetails(): any[] {
    const incongruity = this.evaluacionForm.get('appearance.incongruity')?.value
    return [
      {
        name: 'Incongruencia Normativa - Partes',
        completed: !!(incongruity?.existsIncongruityNormativeParticipants && incongruity?.reasonsIncongruityNormativeParticipants)
      },
      {
        name: 'Incongruencia Normativa - Derecho',
        completed: !!(incongruity?.existsIncongruityNormativeLaw && incongruity?.reasonsIncongruityNormativeLaw)
      },
      {
        name: 'Incongruencia Fáctica - Partes',
        completed: !!(incongruity?.existsIncongruityFactualParticipants && incongruity?.reasonsIncongruityFactualParticipants)
      },
      {
        name: 'Incongruencia Fáctica - Derecho',
        completed: !!(incongruity?.existsIncongruityFactualLaw && incongruity?.reasonsIncongruityFactualLaw)
      }
    ]
  }

  // Obtener detalles de progreso de Evaluación Final
  private getFinalMotivationProgressDetails(): any[] {
    const finalDeficit = this.evaluacionForm.get('finalMotivationDeficit')?.value
    const finalReasons = this.evaluacionForm.get('finalMotivationReasons')?.value

    return [
      {
        name: 'Déficit de Motivación',
        completed: !!finalDeficit
      },
      {
        name: 'Razones del Déficit',
        completed: !!finalReasons
      }
    ]
  }

  // Funciones auxiliares para el HTML
  getSectionIcon(section: any): string {
    switch (section.type) {
      case 'main': return '🎯'
      case 'section': return '📝'
      case 'final': return '🏁'
      default: return '📋'
    }
  }

  getProgressClass(section: any): string {
    let baseClass = 'section-progress'

    if (section.completed) {
      baseClass += ' progress-complete'
    } else if (section.required) {
      baseClass += ' progress-incomplete'
    } else {
      baseClass += ' progress-not-required'
    }

    if (section.active) {
      baseClass += ' progress-active'
    }

    return baseClass
  }

  getSubsectionIcon(subsection: any): string {
    if (subsection.active) {
      return '👉'
    } else if (subsection.completed) {
      return '✅'
    } else if (subsection.required) {
      return '❌'
    } else {
      return '⚪'
    }
  }

  getSubsectionClass(subsection: any): string {
    let baseClass = 'subsection-progress'

    if (subsection.completed) {
      baseClass += ' subsection-complete'
    } else if (subsection.required) {
      baseClass += ' subsection-incomplete'
    } else {
      baseClass += ' subsection-not-required'
    }

    if (subsection.active) {
      baseClass += ' subsection-active'
    }

    return baseClass
  }

  private isNonexistenceComplete(): boolean {
    const section = this.evaluacionForm.get('nonexistinence')?.value
    return !!(section?.lackFoundationNormative &&
      section?.reasonsNormative &&
      section?.lackFoundationFactual &&
      section?.reasonsFactual)
  }

  private isInsufficiencyComplete(): boolean {
    const section = this.evaluacionForm.get('insufficiency')?.value
    return !!(section?.lackFoundationNormative &&
      section?.reasonsNormative &&
      section?.lackFoundationFactual &&
      section?.reasonsFactual)
  }

  isAppearanceComplete()
    : boolean {
    const appearance = this.evaluacionForm.get("appearance")?.value

    if (!appearance?.motivationalHabit) {
      return false;
    }
    const incoherenceIsValid = this.isIncoherenceComplete()
    const inatinenceIsValid = this.isInatinenceComplete()
    const incomprehensibilityIsValid = this.isIncomprehensibilityComplete()
    const incongruityIsValid = this.isIncongruityComplete()

    return incoherenceIsValid &&
      inatinenceIsValid &&
      incomprehensibilityIsValid &&
      incongruityIsValid;
  }



  private isIncoherenceComplete(): boolean {
    const incoherence = this.evaluacionForm.get('appearance.incoherence')?.value
    return !!(incoherence?.existsLogicalNormative &&
      incoherence?.reasonsLogicaNormative &&
      incoherence?.existsDecisionalNormative &&
      incoherence?.reasonsDecisionalNormative &&
      incoherence?.existsLogicalFactual &&
      incoherence?.reasonsLogicalFactual &&
      incoherence?.existsDecisionalFactual &&
      incoherence?.reasonsDecisionalFactual)
  }

  private isInatinenceComplete(): boolean {
    const inatinence = this.evaluacionForm.get('appearance.inatinence')?.value
    return !!(inatinence?.existsInatinenceJuridical &&
      inatinence?.reasonsInatinenceJuridical &&
      inatinence?.existsInatinenceFactual &&
      inatinence?.reasonsInatinenceFactual)
  }

  private isIncomprehensibilityComplete(): boolean {
    const incomprehensibility = this.evaluacionForm.get('appearance.incomprehensibility')?.value
    return !!(incomprehensibility?.existsIncomprehensibilityJuridical &&
      incomprehensibility?.reasonsIncomprehensibilityJuridical &&
      incomprehensibility?.existsIncomprehensibilityFactual &&
      incomprehensibility?.reasonsIncomprehensibilityFactual)
  }

  private isIncongruityComplete(): boolean {
    const incongruity = this.evaluacionForm.get('appearance.incongruity')?.value
    return !!(incongruity?.existsIncongruityNormativeParticipants &&
      incongruity?.reasonsIncongruityNormativeParticipants &&
      incongruity?.existsIncongruityNormativeLaw &&
      incongruity?.reasonsIncongruityNormativeLaw &&
      incongruity?.existsIncongruityFactualParticipants &&
      incongruity?.reasonsIncongruityFactualParticipants &&
      incongruity?.existsIncongruityFactualLaw &&
      incongruity?.reasonsIncongruityFactualLaw)
  }

  loadFormData() {
    this.firestore
      .collection("evaluacion")
      .doc(this.numero_proceso)
      .valueChanges()
      .subscribe((data: any) => {
        if (data) {
          this.evaluacionForm.patchValue(data, { emitEvent: false });

          // ¡AÑADE ESTA LÍNEA!
          // Esto poblará el objeto buttonStates con los datos de calificación.
          this.loadCalificaciones(data);

          // Guardar estado inicial después de cargar datos
          setTimeout(() => {
            this.saveInitialFormState();
            this.changeDetectorRef.detectChanges();
          }, 100);
        }
      });
  }


  handleRadioButtonValues(data: any) {
    const setRadioValues = (obj: any, parentPath = "") => {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const currentPath = parentPath ? `${parentPath}.${key}` : key
          if (typeof obj[key] === "object" && obj[key] !== null) {
            setRadioValues(obj[key], currentPath)
          } else if (key.startsWith("lack") || key.includes("exists") || key === "finalMotivationDeficit") {
            const control = this.evaluacionForm.get(currentPath)
            if (control) {
              control.setValue(obj[key], { emitEvent: false })
            }
          }
        }
      }
    }
    setRadioValues(data)
  }

  // Función submitForm con validación estricta
  submitForm() {
    // Quitar validaciones estrictas temporalmente
    // NUEVO: Validación específica para estudiantes - REQUIERE TODAS LAS SECCIONES
    // if (!this.isDocente) {
    //   if (!this.isFormCompleteForStudent()) {
    //     const incompleteDetails = this.getDetailedIncompleteSections()
    //     this.mostrarMensajeError(`Complete TODAS las secciones antes de guardar:\n\n${incompleteDetails}`)
    //     this.showValidationErrors = true
    //     return
    //   }
    // } else {
    //   // Validación original para docentes
    //   if (!this.validateAllSections()) {
    //     return
    //   }
    // }

    this.isSubmitting = true
    this.cargando = true
    this.evaluacionForm.patchValue({ saved: true })
    if (this.isDocente) {
      this.evaluacionForm.patchValue({ docenteSaved: true })
    }
    const analisisData = this.evaluacionForm.getRawValue()

    for (const [key, value] of Object.entries(this.buttonStates)) {
      const parts = key.split(".")
      let current: any = analisisData
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {}
        current = current[parts[i]]
      }
      current[parts[parts.length - 1]] = value
    }

    const processRadioValues = (obj: any) => {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === "object" && obj[key] !== null) {
            processRadioValues(obj[key])
          } else if (key.startsWith("lack") || key.includes("exists") || key === "finalMotivationDeficit") {
            if (obj[key] === true) obj[key] = "Si"
            if (obj[key] === false) obj[key] = "No"
          }
        }
      }
    }

    processRadioValues(analisisData)
    this.firestore
      .collection("evaluacion")
      .doc(this.numero_proceso)
      .set(analisisData)
      .then(() => {
        this.saved = true
        // NUEVO: Actualizar estado después de guardar
        this.hasUnsavedChanges = false
        this.saveInitialFormState()
        this.showValidationErrors = false
        window.location.reload()
        this.cargando = false
        setTimeout(() => {
          this.isSubmitting = false
        }, 100)
      })
      .catch((error) => {
        this.cargando = false
        this.mostrarMensajeError("Error al guardar")
      })
  }

  mostrarMensajeError(mensaje: string) {
    this.mensajeError = mensaje
    this.mostrarMensaje = true
    setTimeout(() => {
      this.mostrarMensaje = false
      this.mensajeError = ""
    }, 15000)
  }

  // MODIFICADO: redirectToEvaluacion2 con validación estricta
  redirectToEvaluacion2(event: Event) {
    // Quitar validaciones estrictas temporalmente
    // MODIFICADO: Verificar cambios no guardados y formulario completo - TODAS LAS SECCIONES
    // if (!this.isDocente) {
    //   if (this.hasUnsavedChanges) {
    //     this.mostrarMensajeError("Guarde los cambios antes de continuar")
    //     return
    //   }

    //   if (!this.isFormCompleteForStudent()) {
    //     const incompleteDetails = this.getDetailedIncompleteSections()
    //     this.mostrarMensajeError(`Complete TODAS las secciones antes de continuar:\n\n${incompleteDetails}`)
    //     return
    //   }
    // }

    this.router.navigate(["/evaluacion2"], {
      queryParams: {
        numero_proceso: this.numero_proceso,
        asunto: this.asunto,
        estudiante: this.estudiante,
        docente: this.docente,
      },
    })
  }

  guardarYContinuar(event: Event) {
    event.preventDefault();

    // Quitar validaciones estrictas temporalmente
    // Primero guardar
    this.submitForm();

    // Luego navegar después de un breve delay para asegurar que se guarde
    setTimeout(() => {
      this.router.navigate(["/evaluacion2"], {
        queryParams: {
          numero_proceso: this.numero_proceso,
          asunto: this.asunto,
          estudiante: this.estudiante,
          docente: this.docente,
        },
      });
    }, 1500);
  }

  getAppearanceSubsectionDetails(habit: string)
    : string[] {
    const details: string[] = []

    // CAMBIO: Ahora validamos TODAS las subsecciones, no solo la seleccionada
    // Incoherencia
    const incoherence = this.evaluacionForm.get("appearance.incoherence")?.value
    if (!incoherence?.existsLogicalNormative || !incoherence?.reasonsLogicaNormative) {
      details.push("• Incoherencia: Complete incoherencia lógica normativa")
    }
    if (!incoherence?.existsDecisionalNormative || !incoherence?.reasonsDecisionalNormative) {
      details.push("• Incoherencia: Complete incoherencia decisional normativa")
    }
    if (!incoherence?.existsLogicalFactual || !incoherence?.reasonsLogicalFactual) {
      details.push("• Incoherencia: Complete incoherencia lógica fáctica")
    }
    if (!incoherence?.existsDecisionalFactual || !incoherence?.reasonsDecisionalFactual) {
      details.push("• Incoherencia: Complete incoherencia decisional fáctica")
    }

    // Inatinencia
    const inatinence = this.evaluacionForm.get("appearance.inatinence")?.value
    if (!inatinence?.existsInatinenceJuridical || !inatinence?.reasonsInatinenceJuridical) {
      details.push("• Inatinencia: Complete fundamentación jurídica")
    }
    if (!inatinence?.existsInatinenceFactual || !inatinence?.reasonsInatinenceFactual) {
      details.push("• Inatinencia: Complete fundamentación fáctica")
    }

    // Incomprensibilidad
    const incomprehensibility = this.evaluacionForm.get("appearance.incomprehensibility")?.value
    if (
      !incomprehensibility?.existsIncomprehensibilityJuridical ||
      !incomprehensibility?.reasonsIncomprehensibilityJuridical
    ) {
      details.push("• Incomprensibilidad: Complete fundamentación jurídica")
    }
    if (
      !incomprehensibility?.existsIncomprehensibilityFactual ||
      !incomprehensibility?.reasonsIncomprehensibilityFactual
    ) {
      details.push("• Incomprensibilidad: Complete fundamentación fáctica")
    }

    // Incongruencia
    const incongruity = this.evaluacionForm.get("appearance.incongruity")?.value
    if (!incongruity?.existsIncongruityNormativeParticipants || !incongruity?.reasonsIncongruityNormativeParticipants) {
      details.push("• Incongruencia: Complete incongruencia normativa frente a partes")
    }
    if (!incongruity?.existsIncongruityNormativeLaw || !incongruity?.reasonsIncongruityNormativeLaw) {
      details.push("• Incongruencia: Complete incongruencia normativa frente al derecho")
    }
    if (!incongruity?.existsIncongruityFactualParticipants || !incongruity?.reasonsIncongruityFactualParticipants) {
      details.push("• Incongruencia: Complete incongruencia fáctica frente a partes")
    }
    if (!incongruity?.existsIncongruityFactualLaw || !incongruity?.reasonsIncongruityFactualLaw) {
      details.push("• Incongruencia: Complete incongruencia fáctica frente al derecho")
    }

    return details
  }


  isButtonSelected(section: string, controlName: string, value: string): boolean {
    let controlPath = "";
    if (section === "motivationType" || section === "finalMotivation") {
      controlPath = controlName;
    } else {
      controlPath = `${section}.${controlName}`;
    }
    // Ahora la función solo lee del objeto buttonStates, que es lo correcto.
    return this.buttonStates[controlPath] === value;
  }

  loadCalificaciones(data: any) {
    this.buttonStates = {}
    this.updateButtonStates(data, "")
    this.changeDetectorRef.detectChanges()
  }

  updateButtonStates(obj: any, prefix: string) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const fullPath = prefix ? `${prefix}.${key}` : key
        if (typeof obj[key] === "object" && obj[key] !== null) {
          this.updateButtonStates(obj[key], fullPath)
        } else if (key.endsWith("_calificacion")) {
          this.buttonStates[fullPath] = obj[key]
        }
      }
    }
  }

  checkSavedStatus() {
    this.firestore
      .collection("evaluacion")
      .doc(this.numero_proceso)
      .valueChanges()
      .subscribe((data: any) => {
        if (data) {
          this.saved = data.saved || false
        }
        if (data && data.saved) {
          this.saved = true
          const selectElement = document.getElementById("motivationType") as HTMLSelectElement
          if (selectElement) {
            selectElement.disabled = true
          }
        }
      })
  }

  checkLockStatus() {
    this.firestore
      .collection("locks")
      .doc(this.numero_proceso)
      .valueChanges()
      .subscribe((data: any) => {
        if (data && data.locked) {
          this.disableFormControls(this.evaluacionForm)
        }
      })
  }

  setRadioValue(controlPath: string, value: string) {
    const control = this.evaluacionForm.get(controlPath)
    if (control) {
      control.setValue(value, { emitEvent: true })
      this.changeDetectorRef.detectChanges()
    }
  }

  isRadioSelected(controlPath: string, value: string): boolean {
    const control = this.evaluacionForm.get(controlPath)
    return control ? control.value === value : false
  }

  lockForm() {
    this.firestore
      .collection("locks")
      .doc(this.numero_proceso)
      .set({ locked: true })
      .then(() => {
        this.disableFormControls(this.evaluacionForm)
      })
      .catch((error) => {
        console.error("Error locking form: ", error)
      })
  }

  disableFormControls(formGroup: FormGroup | FormArray) {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key)
      control?.disable()
      if (control instanceof FormGroup || control instanceof FormArray) {
        this.disableFormControls(control)
      }
    })
  }

  // ✅ LÓGICA USERDATA ACTUALIZADA
  loadUserData() {
    this.afAuth.user.subscribe((user) => {
      if (user) {
        this.currentUser = this.firestore.collection("users").doc<UserData>(user.uid).valueChanges()
        this.currentUser.subscribe((userData) => {
          // Asignamos el currentUserData centralizado
          this.currentUserData = userData || null;

          // Verificamos si es docente O si es admin (los admins pueden actuar como docentes)
          if (userData && (userData.role === "docente" || userData.isAdmin)) {
            this.isDocente = true
            this.checkDocenteSaved()
          } else {
            // Configurar para estudiantes
            this.isDocente = false
            setTimeout(() => {
              this.saveInitialFormState()
            }, 1000)
          }
        })
        this.loadEvaluacionData()
      }
    })
  }

  loadEvaluacionData() {
    this.firestore
      .collection("evaluacion", (ref) => ref.where("numero_proceso", "==", this.numero_proceso))
      .valueChanges()
      .subscribe((data) => {
        if (data && data.length) {
          const evaluationData = data[0] as evaluacionData
          this.evaluacionForm.patchValue(evaluationData)
        }
      })
  }

  handleMotivationTypeChange(value: string): void {
    this.evaluacionForm.patchValue({ motivationType: value }, { emitEvent: false })
    this.changeDetectorRef.detectChanges()
  }

  checkDocenteSaved() {
    this.firestore
      .collection("evaluacion")
      .doc(this.numero_proceso)
      .valueChanges()
      .subscribe((data: any) => {
        if (data && data.saved) {
          this.docenteSaved = data.docenteSaved || false
        }
      })
  }

  getCalificacionValue(controlPath: string): string {
    const control = this.evaluacionForm.get(controlPath)
    if (control) {
      return control.value ? control.value : "No Calificado"
    }
    return "No Calificado"
  }

  setCalificacion(controlPath: string, calificacion: string): void {
    const control = this.evaluacionForm.get(controlPath)
    if (control) {
      control.setValue(calificacion)
      this.selectedButtons["motivationType"] = calificacion
    }
  }

  redirectToAnalisis2() {
    // NUEVO: Verificar cambios no guardados antes de navegar
    if (!this.isDocente && this.hasUnsavedChanges) {
      if (!confirm('Tiene cambios sin guardar. ¿Está seguro de que desea continuar sin guardar?')) {
        return
      }
    }

    this.router.navigate(["/analisis2"], {
      queryParams: {
        numero_proceso: this.numero_proceso,
        asunto: this.asunto,
        estudiante: this.estudiante,
        docente: this.docente,
      },
    })
  }

  toggleCalificar(section: string) {
    this.calificarState[section] = !this.calificarState[section]
  }

  selectButton(section: string, controlName: string, value: string) {
    this.calificaciones[section] = value
    let controlPath = ""
    if (section === "motivationType" || section === "finalMotivation") {
      controlPath = controlName
    } else {
      controlPath = `${section}.${controlName}`
    }
    const control = this.evaluacionForm.get(controlPath)
    if (control) {
      control.setValue(value, { emitEvent: false })
      this.buttonStates[controlPath] = value
    }
    this.changeDetectorRef.detectChanges()
  }

  isCalificacionCorrecta(field: string): boolean {
    return this.calificaciones[field] === "Correcto"
  }

  isCalificacionIncorrecta(field: string): boolean {
    return this.calificaciones[field] === "Incorrecto"
  }

  getRetroalimentacionValue(controlName: string): string {
    return this.evaluacionForm.get(controlName)?.value || ""
  }

  toggleRetroalimentacion(sectionId: string) {
    this.mostrarRetroalimentacion[sectionId] = !this.mostrarRetroalimentacion[sectionId]
  }

  debugRadioButtons() {
    const searchRadioControls = (group: any, path = "") => {
      for (const key in group.controls) {
        const control = group.controls[key]
        const currentPath = path ? `${path}.${key}` : key
        if (control instanceof FormGroup) {
          searchRadioControls(control, currentPath)
        } else if (key.startsWith("lack") || key.includes("exists") || key === "finalMotivationDeficit") {
          console.log(`Radio button ${currentPath}:`, {
            value: control.value,
            dirty: control.dirty,
            touched: control.touched,
            disabled: control.disabled
          })
        }
      }
    }
    searchRadioControls(this.evaluacionForm)
  }

  validateSection(sectionName: string): string[] {
    const errors: string[] = []
    const section = this.evaluacionForm.get(sectionName)

    if (!section) return errors

    switch (sectionName) {
      case "motivationType":
        if (!section.value) {
          errors.push("Seleccione un tipo de motivación")
        }
        break

      case "finalMotivation":
        const finalMotivationDeficit = this.evaluacionForm.get("finalMotivationDeficit")?.value
        const finalMotivationReasons = this.evaluacionForm.get("finalMotivationReasons")?.value

        if (!finalMotivationDeficit) {
          errors.push("Complete la pregunta sobre déficit de motivación")
        }
        if (!finalMotivationReasons) {
          errors.push("Ingrese las razones sobre el déficit de motivación")
        }
        break

      case "nonexistinence":
        const nonexistence = section.value
        if (!nonexistence.lackFoundationNormative) {
          errors.push("Complete el campo de fundamentación normativa")
        }
        if (!nonexistence.reasonsNormative) {
          errors.push("Ingrese las razones de la fundamentación normativa")
        }
        if (!nonexistence.lackFoundationFactual) {
          errors.push("Complete el campo de fundamentación fáctica")
        }
        if (!nonexistence.reasonsFactual) {
          errors.push("Ingrese las razones de la fundamentación fáctica")
        }
        break

      case "insufficiency":
        const insufficiency = section.value
        if (!insufficiency.lackFoundationNormative) {
          errors.push("Complete el campo de fundamentación normativa")
        }
        if (!insufficiency.reasonsNormative) {
          errors.push("Ingrese las razones de la fundamentación normativa")
        }
        if (!insufficiency.lackFoundationFactual) {
          errors.push("Complete el campo de fundamentación fáctica")
        }
        if (!insufficiency.reasonsFactual) {
          errors.push("Ingrese las razones de la fundamentación fáctica")
        }
        break

      case "appearance":
        const appearance = section.value
        if (!appearance.motivationalHabit) {
          errors.push("Seleccione un vicio motivacional")
        }

        // Validar subsecciones según el vicio motivacional seleccionado
        if (appearance.motivationalHabit === 'incoherence') {
          const incoherence = appearance.incoherence
          if (!incoherence.existsLogicalNormative) {
            errors.push("Complete el campo de incoherencia lógica normativa")
          }
          if (!incoherence.reasonsLogicaNormative) {
            errors.push("Ingrese las razones de la incoherencia lógica normativa")
          }
          // Agregar más validaciones según sea necesario
        }
        break
    }

    return errors
  }

  validateAllSections(): boolean {
    let isValid = true
    this.sectionErrors = {
      motivationType: [],
      nonexistence: [],
      insufficiency: [],
      appearance: [],
      finalMotivation: [],
    }

    // Validar tipo de motivación
    const motivationTypeErrors = this.validateSection('motivationType')
    if (motivationTypeErrors.length > 0) {
      this.sectionErrors["motivationType"] = motivationTypeErrors
      isValid = false
    }

    // Validar sección específica según el tipo de motivación
    const motivationType = this.evaluacionForm.get('motivationType')?.value
    if (motivationType) {
      const sectionErrors = this.validateSection(motivationType)
      if (sectionErrors.length > 0) {
        this.sectionErrors[motivationType] = sectionErrors
        isValid = false
      }
    }

    // Validar evaluación final
    const finalMotivationErrors = this.validateSection('finalMotivation')
    if (finalMotivationErrors.length > 0) {
      this.sectionErrors["finalMotivation"] = finalMotivationErrors
      isValid = false
    }

    if (!isValid) {
      let errorMessage = "Por favor complete los siguientes campos:\n\n"
      Object.entries(this.sectionErrors).forEach(([section, errors]) => {
        if (errors.length > 0) {
          errorMessage += `${this.getSectionTitle(section)}:\n`
          errors.forEach((error) => {
            errorMessage += `• ${error}\n`
          })
          errorMessage += "\n"
        }
      })
      this.mostrarMensajeError(errorMessage.trim())
    }

    return isValid
  }

  getSectionTitle(section: string): string {
    switch (section) {
      case "motivationType":
        return "Tipo de Motivación"
      case "nonexistinence":
        return "Inexistencia"
      case "insufficiency":
        return "Insuficiencia"
      case "appearance":
        return "Apariencia"
      case "finalMotivation":
        return "Evaluación Final"
      default:
        return section
    }
  }
}


interface evaluacionData {
  numero_proceso: string;
  motivationType: string;
  inexistencia?: {
    faltaFundamentacionNormativa: string;
    motivoFundamentacionNormativa: string;
    normativa_calificacion: string;
    normativa_retroalimentacion: string;
    faltaFundamentacionFactica: string;
    motivoFundamentacionFactica: string;
    factica_calificacion: string;
    factica_retroalimentacion: string;
    deficitMotivacion: string;
    motivoDeficitMotivacion: string;
    motivacion_calificacion: string;
    motivacion_retroalimentacion: string;
  };
  insuficiencia?: {
    faltaFundamentacionNormativa: string;
    motivoFundamentacionNormativa: string;
    normativa_calificacion: string;
    normativa_retroalimentacion: string;
    faltaFundamentacionFactica: string;
    motivoFundamentacionFactica: string;
    factica_calificacion: string;
    factica_retroalimentacion: string;
    deficitMotivacion: string;
    motivoDeficitMotivacion: string;
    motivacioncalificacion: string;
    motivacionretroalimentacion: string;
  };
  apariencia?: {
    motivoApariencia: string;
    vicioMotivacional: string;
    incoherenciaJuridica: {
      incoherenciaLogicaNormativa: string;
      motivoLogicaNormativa: string;
      incoherenciaDecisionalNormativa: string;
      motivoDecisionalNormativa: string;
      incoherenciaLogicaFactica: string;
      motivoLogicaFactica: string;
      incoherenciaDecisionalFactica: string;
      motivoDecisionalFactica: string;
      deficitMotivacion: string;
      motivoDeficitMotivacion: string;
    };
  };
}