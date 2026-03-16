import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router, ActivatedRoute } from '@angular/router';
import { Observable, combineLatest, of, BehaviorSubject } from 'rxjs';
import { switchMap, map, startWith, take, finalize } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

// IMPORTANTE: Importamos la interfaz centralizada para manejar los roles
import { AuthService, UserData } from '../../services/auth.service';

interface Sentencia {
  id: any;
  docente?: any; // Informacion del objeto docente (opcional)
  numero_proceso: string;
  asunto: string;
  nombre_estudiante: string;
  email_estudiante: string;
  nombre_docente: string;
  email_docente: string;
  archivoURL?: string;
  estado?: 'aceptar' | 'negar' | null;
  razon?: string;
  isLocked?: boolean; // Esta propiedad parece venir de tu HTML original, la mantengo
  isLockedForAcceptance?: boolean; // Indica si los botones de aceptar/negar deben estar deshabilitadoszzz
  periodo_academico?: string;
  fecha_creacion?: any;
  fecha_actualizacion?: any;
}

@Component({
  selector: 'app-principal-page',
  templateUrl: './principal-page.component.html',
  styleUrls: ['./principal-page.component.css'],
})
export class PrincipalPageComponent implements OnInit {
  user: any = null;
  userRole: string | null = null;

  // DATOS DE USUARIO ACTUALIZADOS (Para verificar si es Admin)
  currentUserData: UserData | null = null;

  // VARIABLES NUEVAS PARA EL DASHBOARD ADMIN
  allUsers: UserData[] = [];
  filteredUsers: UserData[] = [];
  pagedUsers: UserData[] = []; // Usuarios de la página actual
  adminSearchText: string = '';
  // Variable para el filtro de rol
  adminRoleFilter: string = 'all';
  showAdminPanel: boolean = false;

  // DROPDOWN DE VISTA (ADMIN/DOCENTE)
  vistaAdminSeleccionada: 'global' | 'mias' = 'global';
  soloMisSentencias: boolean = false;

  // Paginación Admin
  adminPageSize = 10;
  adminCurrentPage = 1;
  adminTotalPages = 1;

  // FILTROS (Periodo y Fecha)
  periodosOptions: string[] = []; // Lista de nombres de periodos cargados
  selectedPeriod: string = 'all'; // 'all', 'none', o nombre del periodo
  fechaInicio: string | null = null;
  fechaFin: string | null = null;

  // Cambiamos sentencias$ para que sea un BehaviorSubject que se actualizará con los datos crudos
  private _allSentencias = new BehaviorSubject<Sentencia[]>([]);
  public filteredSentencias$: Observable<Sentencia[]>; // Este es el observable que usará el HTML
  searchText: string = '';
  private searchSubject = new BehaviorSubject<string>('');
  showRazonOverlay = false;
  razonTexto = '';
  accionPendiente: 'aceptar' | 'negar' = 'aceptar';
  sentenciaPendiente: Sentencia | null = null;
  numeroProcesoBusqueda: string = '';
  sentenciaEncontrada: Sentencia | null = null;
  mensajeBusqueda: string = '';
  mostrarMensajeBusqueda: boolean = false;
  showEditarEstadoOverlay = false;
  nuevoEstado: 'aceptar' | 'negar' | null = null;
  sentenciaEditar: Sentencia | null = null;
  alert: string = '';
  alertype: 'success' | 'error' = 'success';

  // Variables para el modal de alerta informativa
  alertModalVisible = false;
  alertModalMessage = '';
  private _pendingModalAction: (() => void) | null = null;

  // Alerta de docente inactivo
  showInactiveAlert: boolean = false;

  sentenciaAEliminar: any = null;
  userName: string = "";
  userEmail: string = "";
  showOverlay = false;
  selectedSentencia: Sentencia | null = null;  // Variables de paginación
  pageSize = 20;
  currentPage = 1;
  visitedPages: any[] = []; // Array de documentos visitados
  isLastPage = false;
  isFirstPage = true;
  pagedSentencias: Sentencia[] = [];

  // Indicador de carga global
  isLoading: boolean = false;
  loadingPage = false;
  // Variables para manejar búsqueda
  isSearchMode = false;
  searchResults: Sentencia[] = [];
  totalPages = 0;
  hasMorePages = false;

  // NUEVO: Variables para mostrar el estado de calificación por secciones
  progresoCalificacion: { [numero_proceso: string]: { analisis: boolean, analisis2: boolean, evaluacion: boolean, evaluacion2: boolean } } = {};

  constructor(
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Configurar filteredSentencias$ para que solo procese isLockedForAcceptance
    this.filteredSentencias$ = combineLatest([
      this._allSentencias.asObservable(),
      this.searchSubject.asObservable()
    ]).pipe(
      map(([sentencias, searchText]) => {
        console.log('🔍 Constructor - Total sentencias:', sentencias.length);

        // Solo procesar isLockedForAcceptance, la búsqueda se maneja en onSearchTextChanged
        const acceptedProcessNumbers = new Set<string>();
        sentencias.forEach(s => {
          if (s.estado === 'aceptar') {
            acceptedProcessNumbers.add(s.numero_proceso);
          }
        });

        const processedSentencias = sentencias.map(s => {
          const isLocked = acceptedProcessNumbers.has(s.numero_proceso);
          return {
            ...s,
            isLockedForAcceptance: isLocked
          };
        });

        // Ordenamiento por Fecha de Creación
        processedSentencias.sort((a, b) => {
          const dateA = a.fecha_creacion ? (a.fecha_creacion.toDate ? a.fecha_creacion.toDate() : new Date(a.fecha_creacion)) : new Date(0);
          const dateB = b.fecha_creacion ? (b.fecha_creacion.toDate ? b.fecha_creacion.toDate() : new Date(b.fecha_creacion)) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        return processedSentencias;
      })
    );
  }

  ngOnInit() {
    this.isLoading = true;

    this.route.queryParams.subscribe(params => {
      if (params['error'] === 'access_denied') {
        this.showNotification('⛔ Acceso denegado. No tiene permisos para visualizar este expediente.', 'error');
        this.router.navigate([], {
          queryParams: { 'error': null },
          queryParamsHandling: 'merge'
        });
      }
    });

    this.cargarPeriodosDisponibles(); // Cargar lista de periodos para el filtro

    this.afAuth.authState.subscribe(user => {
      if (user) {
        if (!sessionStorage.getItem('userId')) {
          console.log('🔄 Restaurando userId en sessionStorage...');
          sessionStorage.setItem('userId', user.uid);
          sessionStorage.setItem('sessionToken', 'active');
        }

        this.user = user;
        this.loadUserData(user.uid);
      } else {
        this.isLoading = false;
        // Opcional: this.router.navigate(['/login']);
      }
    });
  }

  // Cargar periodos para el dropdown
  cargarPeriodosDisponibles() {
    this.firestore.collection('periodoAcademico').valueChanges().subscribe((periodos: any[]) => {
      const periodosValidos = periodos.filter(p => p.anio_inicio > 2000);
      this.periodosOptions = periodosValidos.map(p => p.nombre).sort();
    });
  }

  actualizarFiltros() {
    this.searchSubject.next(this.searchText);
    this.currentPage = 1;
    this.onSearchTextChanged();
  }

  async desbloquearSentencia(sentencia: Sentencia) {
    if (!confirm('¿Está seguro de desbloquear esta sentencia? Esto permitirá modificaciones nuevamente.')) {
      return;
    }

    try {
      this.isLoading = true;
      await this.firestore.collection('locks').doc(sentencia.numero_proceso).delete();
      if (sentencia.id) {
        await this.firestore.collection('sentencias').doc(sentencia.id).update({ isLocked: false });
      } else {
        const query = await this.firestore.collection('sentencias', ref => ref.where('numero_proceso', '==', sentencia.numero_proceso)).get().toPromise();
        if (query && !query.empty) {
          await query.docs[0].ref.update({ isLocked: false });
        }
      }

      this.showNotification('Sentencia desbloqueada correctamente.', 'success');

      // RECARGAR LOS DATOS PARA QUE LA UI SE ACTUALICE
      if (this.isSearchMode) {
        this.onSearchTextChanged();
      } else if (this.sentenciaEncontrada && this.sentenciaEncontrada.numero_proceso === sentencia.numero_proceso) {
        // Si es una búsqueda específica de estudiante
        this.buscarPorNumeroProceso();
      } else {
        // Si es la lista normal paginada
        this.loadPagedSentencias('init');
      }

    } catch (error) {
      console.error('Error al desbloquear:', error);
      this.showNotification('Error al desbloquear la sentencia.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  // FUNCIONES DEL DASHBOARD DE ADMIN

  toggleAdminView() {
    this.showAdminPanel = !this.showAdminPanel;
  }

  // Cambio de vista desde el Dropdown
  cambiarVistaAdmin() {
    this.soloMisSentencias = (this.vistaAdminSeleccionada === 'mias');
    // Usamos limpiarBusquedaGeneral para asegurar que se borren los filtros de texto/fecha/periodo
    this.limpiarBusquedaGeneral();

    const modo = this.soloMisSentencias ? 'Solo mis asignaciones' : 'Vista Global (Todas las sentencias)';
    this.showNotification(`Cambiado a: ${modo}`, 'success');
  }

  loadAllUsers() {
    this.firestore.collection('users').valueChanges({ idField: 'uid' }).subscribe((users: any[]) => {
      this.allUsers = users.map(u => ({
        ...u,
        isAdmin: u.isAdmin === true,
        isActive: u.isActive !== false
      }));
      this.filterUsers();
    });
  }

  filterUsers() {
    let filtered = [...this.allUsers];

    // Filtrado por Rol
    if (this.adminRoleFilter !== 'all') {
      if (this.adminRoleFilter === 'admin') {
        filtered = filtered.filter(u => u.isAdmin);
      } else {
        filtered = filtered.filter(u => u.role === this.adminRoleFilter);
      }
    }

    // Filtrado por Texto (Buscador)
    if (this.adminSearchText) {
      const search = this.adminSearchText.toLowerCase();
      filtered = filtered.filter(u =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.role.toLowerCase().includes(search)
      );
    }

    this.filteredUsers = filtered;

    // Reiniciar paginación al filtrar
    this.adminCurrentPage = 1;
    this.updateAdminPagination();
  }

  updateAdminPagination() {
    this.adminTotalPages = Math.ceil(this.filteredUsers.length / this.adminPageSize);
    const startIndex = (this.adminCurrentPage - 1) * this.adminPageSize;
    const endIndex = startIndex + this.adminPageSize;
    this.pagedUsers = this.filteredUsers.slice(startIndex, endIndex);
  }

  nextAdminPage() {
    if (this.adminCurrentPage < this.adminTotalPages) {
      this.adminCurrentPage++;
      this.updateAdminPagination();
    }
  }

  prevAdminPage() {
    if (this.adminCurrentPage > 1) {
      this.adminCurrentPage--;
      this.updateAdminPagination();
    }
  }

  toggleUserStatus(user: UserData) {
    if (!user.uid) return;
    const newState = !user.isActive;
    this.firestore.collection('users').doc(user.uid).update({ isActive: newState })
      .then(() => this.showNotification(`Usuario ${newState ? 'activado' : 'desactivado'}`, 'success'))
      .catch(err => this.showNotification('Error al actualizar estado', 'error'));
  }

  changeUserRole(user: UserData, newRole: string) {
    if (!user.uid) return;
    this.firestore.collection('users').doc(user.uid).update({ role: newRole })
      .then(() => this.showNotification(`Rol actualizado a ${newRole}`, 'success'))
      .catch(err => this.showNotification('Error al actualizar rol', 'error'));
  }

  toggleAdminPermission(user: UserData) {
    if (!user.uid) return;
    if (user.email === this.userEmail) {
      alert("No puedes quitarte tus propios permisos de administrador.");
      return;
    }
    const newState = !user.isAdmin;
    this.firestore.collection('users').doc(user.uid).update({ isAdmin: newState })
      .then(() => this.showNotification(`Permisos de administrador ${newState ? 'otorgados' : 'revocados'}`, 'success'))
      .catch(err => this.showNotification('Error al actualizar permisos', 'error'));
  }

  abrirRazon(sentencia: Sentencia, accion: 'aceptar' | 'negar') {
    this.sentenciaPendiente = sentencia;
    this.accionPendiente = accion;
    this.razonTexto = '';
    this.showRazonOverlay = true;
  }

  openOverlay(sentencia: Sentencia) {
    this.selectedSentencia = sentencia;
    this.showOverlay = true;
  }

  closeOverlay() {
    this.showOverlay = false;
    this.selectedSentencia = null;
  }

  getStatusText(estado: 'aceptar' | 'negar' | null): string {
    switch (estado) {
      case 'aceptar':
        return 'Sentencia aceptada';
      case 'negar':
        return 'Sentencia negada';
      default:
        return 'Estado de sentencia desconocido';
    }
  }

  getStatusClass(estado: 'aceptar' | 'negar' | null): string {
    switch (estado) {
      case 'aceptar':
        return 'estado-aceptado';
      case 'negar':
        return 'estado-negado';
      default:
        return 'estado-desconocido';
    }
  }

  /**
   * Guarda la decisión del docente (Aceptar o Negar sentencia).
   * - Si acepta: Verifica que no exista ya otra sentencia aceptada para el mismo proceso.
   * - Si niega: Requiere razón.
   * - Actualiza Firestore y rechaza automáticamente duplicados si se acepta.
   */
  async guardarDecision() {
    if (!this.sentenciaPendiente || (!this.sentenciaPendiente.id && !this.sentenciaPendiente.numero_proceso)) {
      console.error('Falta información necesaria para actualizar la sentencia.');
      return;
    }

    // Validar razón solo si se niega (o siempre, según tu preferencia). Aquí obligamos siempre.
    if (!this.razonTexto.trim()) {
      this.showNotification('Debe ingresar una razón.', 'error');
      return;
    }

    try {
      this.isLoading = true; // Activar spinner

      // Verificar conexión
      await this.firestore.firestore.enableNetwork();

      // PASO 1: Verificar si este numero_proceso ya ha sido aceptado por CUALQUIER sentencia.
      // Esto previene que se acepten múltiples sentencias para el mismo proceso.

      if (this.accionPendiente === 'aceptar') {
        console.log('🔎 Verificando si el número de proceso ya está aceptado globalmente...');
        const existingAcceptedQuery = await this.firestore
          .collection('sentencias')
          .ref.where('numero_proceso', '==', this.sentenciaPendiente.numero_proceso)
          .where('estado', '==', 'aceptar')
          .limit(1)
          .get();

        if (!existingAcceptedQuery.empty) {
          this.resetFormState();
          this.showNotification('Este número de proceso ya ha sido aceptado por otra sentencia.', 'error');
          this.isLoading = false;
          return;
        }
      }

      // Si tenemos ID, usamos el ID directamente.
      if (this.sentenciaPendiente.id) {
        const docRef = this.firestore.collection('sentencias').doc(this.sentenciaPendiente.id).ref;

        await this.firestore.firestore.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef);
          if (!doc.exists) throw new Error("Documento no encontrado");

          const updateData = {
            estado: this.accionPendiente,
            razon: this.razonTexto.trim(),
            fecha_actualizacion: new Date(),
            actualizado_por: this.userEmail,
          };

          transaction.update(docRef, updateData);

          // Rechazar duplicados si se acepta
          if (this.accionPendiente === 'aceptar') {
            const numeroProcesoAceptado = this.sentenciaPendiente!.numero_proceso;
            const otherSentenciasQuery = await this.firestore
              .collection('sentencias')
              .ref.where('numero_proceso', '==', numeroProcesoAceptado)
              .get();

            otherSentenciasQuery.docs.forEach((otherDoc) => {
              const otherDocData = otherDoc.data() as Sentencia;
              if (otherDoc.id !== this.sentenciaPendiente!.id && otherDocData.estado !== 'aceptar') {
                transaction.update(otherDoc.ref, {
                  estado: 'negar',
                  razon: `Rechazada automáticamente: Proceso '${numeroProcesoAceptado}' aceptado por ${this.userEmail}.`,
                  fecha_actualizacion: new Date(),
                  actualizado_por: 'Sistema (auto-rechazo)',
                });
              }
            });
          }
        });

      } else {
        let query = this.firestore.collection('sentencias').ref
          .where('numero_proceso', '==', this.sentenciaPendiente.numero_proceso)
          .where('email_estudiante', '==', this.sentenciaPendiente.email_estudiante);

        // Solo filtramos por docente si NO es admin
        if (!this.currentUserData?.isAdmin && this.userRole === 'docente') {
          query = query.where('email_docente', '==', this.userEmail);
        }

        const querySnapshot = await query.limit(1).get();

        if (querySnapshot.empty) {
          console.error('❌ No se encontró la sentencia específica.');
          this.resetFormState();
          this.isLoading = false;
          return;
        }

        const docSnapshot = querySnapshot.docs[0];

        await docSnapshot.ref.update({
          estado: this.accionPendiente,
          razon: this.razonTexto.trim(),
          fecha_actualizacion: new Date(),
          actualizado_por: this.userEmail,
        });
      }

      // Recargar SOLO las sentencias para refrescar la UI sin perder el contexto de búsqueda/filtros
      this.loadSentencias().subscribe(sentencias => {
        this._allSentencias.next(sentencias);

        if (this.isSearchMode) {
          console.log('🔄 Refrescando búsqueda actual...');
          this.onSearchTextChanged(); // Re-aplicar filtros actuales
        } else {
          console.log('🔄 Refrescando lista paginada...');
          this.loadPagedSentencias('init');
        }
      });

      // Guardar acción antes de resetear el estado del formulario
      const accionRealizada = this.accionPendiente;
      this.resetFormState(); // Limpiar el estado del formulario
      console.log('Proceso de actualización completado');

      // Si se aceptó, mostrar modal informativo al docente
      if (accionRealizada === 'aceptar') {
        this.alertModalMessage = 'Se ha habilitado el acceso para que el estudiante inicie el análisis y evaluación de la sentencia. Una vez completada la información, podrá realizarse la validación correspondiente.';
        this.alertModalVisible = true;
      } else {
        this.showNotification('Decisión guardada exitosamente.', 'success');
      }

    } catch (error) {
      console.error('❌ Error detallado al actualizar:', error);
      console.error('Código de error:', (error as any).code);
      console.error('Mensaje:', (error as any).message);
      this.showNotification('Error al guardar la decisión.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  // Función auxiliar para limpiar el estado del formulario
  private resetFormState() {
    this.showRazonOverlay = false;
    this.sentenciaPendiente = null;
    this.razonTexto = '';
  }

  cancelarDecision() {
    this.showRazonOverlay = false;
    this.sentenciaPendiente = null;
    this.razonTexto = '';
  }

  loadUserData(uid: string) {
    this.isLoading = true;
    this.firestore.collection('users').doc(uid).valueChanges().pipe(
      switchMap((userData: any) => {
        if (userData) {
          // Guardamos datos completos (isAdmin)
          this.currentUserData = userData as UserData;

          this.userName = userData.name;
          this.userEmail = userData.email;
          this.userRole = userData.role;

          // NUEVO: Chequeo de usuario inactivo
          if (this.userRole === 'docente' && this.currentUserData.isActive === false) {
            this.showInactiveAlert = true;
          } else {
            this.showInactiveAlert = false;
          }

          // Si es admin, cargamos usuarios
          if (this.currentUserData.isAdmin) {
            this.loadAllUsers();
          }

          // Ahora llamamos a loadSentencias
          return this.loadSentencias();
        } else {
          return of([]);
        }
      }),
      finalize(() => this.isLoading = false) // Asegura quitar el spinner
    ).subscribe((sentencias) => {
      // Directamente actualizamos el BehaviorSubject con las sentencias cargadas
      this._allSentencias.next(sentencias);
      this.searchSubject.next(this.searchText); // trigger initial filter

      // Solo cargar paginación si no estamos en modo de búsqueda
      if (!this.isSearchMode) {
        this.loadPagedSentencias('init');
      } else {
        // Si estaba en búsqueda, quitar loading ya
        this.isLoading = false;
      }
    });
  }

  /**
   * Carga las sentencias desde Firestore basándose en el rol del usuario.
   * - Administrador: Puede ver todo o filtrar por sus propias asignaciones.
   * - Docente: Solo ve sentencias donde `email_docente` coincide con su email.
   * - Estudiante: Solo ve sentencias donde `email_estudiante` coincide con su email.
   * @returns Observable<Sentencia[]>
   */
  loadSentencias(): Observable<Sentencia[]> {
    let query;

    const esAdmin = this.userRole === 'administrador' || this.currentUserData?.isAdmin;

    // Si es admin y NO ha activado "solo mis sentencias", carga TODO
    if (esAdmin && !this.soloMisSentencias) {
      query = this.firestore.collection('sentencias');
    }
    // Si es admin PERO activó "solo mis sentencias", entra en la lógica de abajo (filtra por email_docente)
    else if ((esAdmin && this.soloMisSentencias) || (this.userRole === 'docente' && this.userEmail)) {
      // Admin filtrando por sí mismo O Docente normal
      query = this.firestore.collection('sentencias', ref =>
        ref.where('email_docente', '==', this.userEmail)
      );
    }
    else if (this.userRole === 'estudiante' && this.userEmail) {
      query = this.firestore.collection('sentencias', ref =>
        ref.where('email_estudiante', '==', this.userEmail)
      );
    } else {
      return of([]);
    }

    return query.snapshotChanges().pipe(
      map(actions => actions.map(a => {
        const data = a.payload.doc.data() as any; // Cast to any to handle timestamp conversion safely
        const id = a.payload.doc.id;

        const convertToDate = (field: any) => {
          if (!field) return null;
          if (typeof field.toDate === 'function') return field.toDate();
          if (field.seconds !== undefined && field.nanoseconds !== undefined) {
            return new Date(field.seconds * 1000 + field.nanoseconds / 1000000);
          }
          return field;
        };

        data.fecha_creacion = convertToDate(data.fecha_creacion);
        data.fecha_actualizacion = convertToDate(data.fecha_actualizacion);

        return { ...data, id } as Sentencia;
      }))
    );
  }

  redirectToNuevaSentencia() {
    // Muestra modal informativo al estudiante antes de navegar
    if (this.userRole === 'estudiante') {
      this._pendingModalAction = () => this.router.navigate(['/nueva-sentencia']);
      this.alertModalMessage = 'Recuerde anonimizar los nombres de todas las personas involucradas en la sentencia (p.ej. actor, demandado; condenado, victima; etc.) para garantizar la protección de sus datos personales, en el proceso de análisis y evaluación que realizarás a continuación.';
      this.alertModalVisible = true;
    } else {
      this.router.navigate(['/nueva-sentencia']);
    }
  }

  redirectToAnalisis(sentencia: Sentencia) {
    const doNav = () => this.router.navigate(['/analisis'], {
      queryParams: {
        id: sentencia.id,
        numero_proceso: sentencia.numero_proceso || 'SIN_PROCESO',
        asunto: sentencia.asunto,
        estudiante: sentencia.nombre_estudiante,
        docente: sentencia.nombre_docente,
        archivoURL: sentencia.archivoURL
      }
    }).then(success => console.log('Navigation success:', success))
      .catch(err => console.error('Navigation error:', err));

    // Muestra modal informativo al estudiante antes de navegar
    if (this.userRole === 'estudiante') {
      this._pendingModalAction = doNav;
      this.alertModalMessage = 'Se ha iniciado el proceso de análisis y evaluación de la motivación de la sentencia. Por favor, complete todos los campos requeridos en cada sección, asegurándose de guardar los cambios para avanzar. Una vez que finalice el registro, la información quedará pendiente para que el docente realice la validación.';
      this.alertModalVisible = true;
    } else {
      doNav();
    }
  }

  /** Cierra el modal de alerta y ejecuta la acción pendiente si la hay */
  onAlertModalClose(): void {
    this.alertModalVisible = false;
    if (this._pendingModalAction) {
      this._pendingModalAction();
      this._pendingModalAction = null;
    }
  }

  onSearchTextChanged() {
    // Resetear paginación cuando se inicia una búsqueda
    const hasActiveFilters =
      (this.searchText && this.searchText.trim() !== '') ||
      this.selectedPeriod !== 'all' ||
      !!this.fechaInicio ||
      !!this.fechaFin;

    if (hasActiveFilters) {
      this.currentPage = 1;
      this.isSearchMode = true;

      // Obtener todas las sentencias procesadas del observable
      this.filteredSentencias$.pipe(take(1)).subscribe(processedSentencias => {
        console.log('🔍 Total sentencias procesadas disponibles:', processedSentencias.length);

        // Aplicar filtro según el rol
        let filtered: Sentencia[] = [];

        const esAdmin = this.currentUserData?.isAdmin || this.userRole === 'administrador' || this.userRole === 'docente';

        // 1. Filtrado Base por Rol
        let baseSentencias = processedSentencias;
        if ((this.currentUserData?.isAdmin || this.userRole === 'administrador') && this.soloMisSentencias) {
          baseSentencias = processedSentencias.filter(s => s.email_docente === this.userEmail);
        }

        // 2. Aplicar TODOS los filtros MANUALMENTE aquí (Texto + Periodo + Fecha)
        filtered = baseSentencias.filter(s => {
          // A. TEXTO
          let matchText = true;
          if (this.searchText && this.searchText.trim()) {
            const term = this.searchText.toLowerCase();

            const isAdmin = this.currentUserData?.isAdmin || this.userRole === 'administrador';

            if (isAdmin) {
              matchText = Object.values(s).some(value =>
                value && value.toString().toLowerCase().includes(term)
              );
            } else if (this.userRole === 'docente') {
              matchText = !!(
                (s.nombre_estudiante && s.nombre_estudiante.toLowerCase().includes(term)) ||
                (s.numero_proceso && s.numero_proceso.toLowerCase().includes(term)) ||
                (s.asunto && s.asunto.toLowerCase().includes(term))
              );
            } else if (this.userRole === 'estudiante') {
              matchText = s.email_estudiante?.toLowerCase().includes(term) || false;
            }
          }

          // B. PERIODO
          let matchPeriod = true;
          if (this.selectedPeriod !== 'all') {
            if (this.selectedPeriod === 'none') {
              matchPeriod = !s.periodo_academico || s.periodo_academico === '';
            } else {
              matchPeriod = s.periodo_academico === this.selectedPeriod;
            }
          }

          // C. FECHAS
          let matchDate = true;
          if (this.fechaInicio || this.fechaFin) {
            let sDate: Date | null = null;
            if (s.fecha_creacion && typeof s.fecha_creacion.toDate === 'function') {
              sDate = s.fecha_creacion.toDate();
            } else if (s.fecha_creacion) {
              sDate = new Date(s.fecha_creacion);
            } else {
              matchDate = false;
            }

            if (matchDate && sDate) {
              if (this.fechaInicio) {
                const [year, month, day] = this.fechaInicio.split('-').map(Number);
                const start = new Date(year, month - 1, day, 0, 0, 0, 0);
                if (sDate < start) matchDate = false;
              }
              if (this.fechaFin && matchDate) {
                const [year, month, day] = this.fechaFin.split('-').map(Number);
                const end = new Date(year, month - 1, day, 23, 59, 59, 999);
                if (sDate > end) matchDate = false;
              }
            }
          }

          return matchText && matchPeriod && matchDate;
        });

        // Actualizar resultados de búsqueda
        this.searchResults = filtered;
        console.log('🔍 Resultados de búsqueda guardados:', this.searchResults.length);
        this.loadSearchResults();
      });

    } else {
      console.log('🔍 Desactivando modo de búsqueda');
      this.isSearchMode = false;
      this.searchResults = [];
      // Volver a la paginación normal
      this.loadPagedSentencias('init');
    }

    // Actualizar el BehaviorSubject para mantener la consistencia
    this.searchSubject.next(this.searchText);
  }

  loadSearchResults() {
    if (this.isSearchMode && this.searchResults.length >= 0) { // >= 0 para manejar "0 resultados"
      this.updatePaginationOnSearch();
    }
  }

  updatePaginationOnSearch() {
    this.totalPages = Math.ceil(this.searchResults.length / this.pageSize);
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.pagedSentencias = this.searchResults.slice(startIndex, endIndex);
    this.loadingPage = false;
    this.checkCalificacionStatus();
  }

  // Método para mostrar mensajes
  private mostrarMensaje(mensaje: string, p0: boolean) {
    this.mensajeBusqueda = mensaje;
    this.mostrarMensajeBusqueda = true;
    setTimeout(() => {
      this.mostrarMensajeBusqueda = false;
    }, 3000);
  }

  // Método para limpiar la búsqueda
  limpiarBusqueda() {
    this.numeroProcesoBusqueda = '';
    this.sentenciaEncontrada = null;
    this.mostrarMensajeBusqueda = false;
  }

  // Método para limpiar la búsqueda general
  limpiarBusquedaGeneral() {
    // console.log('🔍 Limpiando búsqueda general');
    this.searchText = '';
    this.selectedPeriod = 'all'; // Resetear periodo
    this.fechaInicio = null;     // Resetear fecha inicio
    this.fechaFin = null;        // Resetear fecha fin
    this.isSearchMode = false;
    this.searchResults = [];
    this.currentPage = 1;
    this.searchSubject.next('');
    this.loadPagedSentencias('init');
  }

  validarBusquedaProceso(event: KeyboardEvent): boolean {
    // Bloquear espacios
    if (event.key === ' ') {
      event.preventDefault();
      return false;
    }

    // Permitir solo números y guiones
    const pattern = /[0-9-]/;
    const inputChar = String.fromCharCode(event.charCode);

    // Si el carácter no coincide con el patrón, prevenir la entrada
    if (!pattern.test(inputChar)) {
      event.preventDefault();
      return false;
    }

    return true;
  }

  // Método para formatear el input de búsqueda
  formatearBusquedaProceso(event: any) {
    let valor = event.target.value;
    // Eliminar cualquier carácter que no sea número o guion
    valor = valor.replace(/[^0-9-]/g, '');
    this.numeroProcesoBusqueda = valor;
  }

  // Método corregido para búsqueda por número de proceso
  async buscarPorNumeroProceso() {
    const numeroProceso = this.numeroProcesoBusqueda.trim();

    if (!numeroProceso) {
      console.log('Por favor, ingrese un número de proceso');
      return;
    }

    try {
      // console.log('🔍 Buscando sentencias con número de proceso:', numeroProceso);
      this.isLoading = true;

      // Buscar TODAS las sentencias con ese número de proceso
      const sentenciaSnapshot = await this.firestore
        .collection('sentencias')
        .ref.where('numero_proceso', '==', numeroProceso)
        .get();

      if (sentenciaSnapshot.empty) {
        this.sentenciaEncontrada = null;
        this.mostrarMensaje('No se encontró ninguna sentencia', false);
        this.isLoading = false;
        return;
      }

      console.log(`📊 Se encontraron ${sentenciaSnapshot.docs.length} sentencia(s) con ese número`);

      // Si hay múltiples sentencias, mostrar información adicional
      if (sentenciaSnapshot.docs.length > 1) {
        console.log('⚠️ Múltiples sentencias encontradas:');
        sentenciaSnapshot.docs.forEach((doc, index) => {
          const data = doc.data() as Sentencia;
          console.log(`${index + 1}. Estudiante: ${data.nombre_estudiante}, Estado: ${data.estado || 'Pendiente'}`);
        });
      }

      // Para la búsqueda, mostrar la más reciente o la que corresponda al rol del usuario
      let sentenciaParaMostrar;

      if (this.userRole === 'docente') {
        // Si es docente, buscar la sentencia asignada a él
        const sentenciaDocente = sentenciaSnapshot.docs.find((doc) =>
          (doc.data() as Sentencia).email_docente === this.userEmail
        );
        sentenciaParaMostrar = sentenciaDocente || sentenciaSnapshot.docs[0];
      } else {
        // Si es administrador o estudiante, mostrar la primera encontrada
        sentenciaParaMostrar = sentenciaSnapshot.docs[0];
      }

      const sentenciaData = sentenciaParaMostrar.data() as Sentencia;

      // Buscar el estado de bloqueo
      const lockDoc = await this.firestore.doc(`locks/${numeroProceso}`).get().toPromise();
      const lockData = lockDoc?.data() as { locked?: boolean } | undefined;

      this.sentenciaEncontrada = {
        ...sentenciaData,
        isLocked: lockData?.locked || false,
      };

      console.log(`Sentencia encontrada (${sentenciaSnapshot.docs.length} total)`);
    } catch (error) {
      // console.error('Error al buscar la sentencia:', error);
      console.log('Error al buscar la sentencia');
    } finally {
      this.isLoading = false;
    }
  }

  // Método para obtener el texto del estado de bloqueo
  getEstadoBloqueo(sentencia: Sentencia): string {
    return sentencia.isLocked ? 'Finalizada (Bloqueada)' : 'En proceso';
  }

  abrirEdicionEstado(sentencia: Sentencia) {
    this.sentenciaEditar = sentencia;
    this.nuevoEstado = sentencia.estado ?? null;
    this.razonTexto = sentencia.razon || '';
    this.showEditarEstadoOverlay = true;
  }

  // Método corregido para editar estado (administrador)
  async guardarEdicionEstado() {
    if (!this.sentenciaEditar || !this.sentenciaEditar.id || !this.nuevoEstado || !this.razonTexto.trim()) {
      console.error('Falta información necesaria para actualizar el estado');
      if (!this.razonTexto.trim()) this.showNotification('Debe ingresar una razón', 'error');
      return;
    }

    try {
      this.isLoading = true;
      // ACTUALIZACIÓN DIRECTA POR ID
      const docRef = this.firestore.collection('sentencias').doc(this.sentenciaEditar.id);

      const updateData = {
        estado: this.nuevoEstado,
        razon: this.razonTexto.trim(),
        fecha_actualizacion: new Date(),
        editado_por: this.userEmail,
      };

      await docRef.update(updateData);
      console.log('✅ Estado actualizado exitosamente');

      // Guardar el estado antes de cerrar el overlay (closeEditarEstadoOverlay resetea nuevoEstado a null)
      const estadoGuardado = this.nuevoEstado;
      this.closeEditarEstadoOverlay();

      // Si se aceptó, mostrar modal informativo al docente
      if (estadoGuardado === 'aceptar') {
        this.alertModalMessage = 'Se ha habilitado el acceso para que el estudiante inicie el análisis y evaluación de la motivación de la sentencia. Una vez completada la información, podrá realizarse la validación correspondiente.';
        this.alertModalVisible = true;
      }

      // Recargar SOLO las sentencias para refrescar la UI sin perder el contexto de búsqueda/filtros
      this.loadSentencias().subscribe(sentencias => {
        this._allSentencias.next(sentencias);

        if (this.isSearchMode) {
          console.log('🔄 Refrescando búsqueda actual (Edición Estado)...');
          this.onSearchTextChanged(); // Re-aplicar filtros actuales
        } else {
          console.log('🔄 Refrescando lista paginada (Edición Estado)...');
          this.loadPagedSentencias('init');
        }
      });
      this.showNotification('Estado de sentencia actualizado.', 'success');

    } catch (error) {
      console.error('❌ Error al actualizar el estado:', error);
      this.showNotification('Error al actualizar el estado de la sentencia.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  closeEditarEstadoOverlay() {
    this.showEditarEstadoOverlay = false;
    this.sentenciaEditar = null;
    this.nuevoEstado = null;
    this.razonTexto = '';
  }

  // Method to cancel edit status
  cancelarEdicionEstado() {
    this.closeEditarEstadoOverlay();
  }

  showNotification(message: string, type: 'success' | 'error') {
    this.alert = message;
    this.alertype = type;
    setTimeout(() => {
      this.alert = '';
    }, 4000); // Se oculta después de 4 segundos
  }

  // Método corregido para editar sentencia en principal-page.component.ts
  async editarSentencia(numero_proceso: string, email_estudiante?: string, email_docente?: string): Promise<void> {
    console.log('🔧 Iniciando edición de sentencia:', numero_proceso);

    // Obtener las sentencias actuales del BehaviorSubject
    const sentencias = this._allSentencias.getValue();
    console.log('📋 Buscando en', sentencias.length, 'sentencias');
    let sentencia;

    // Verificar si es Admin (aunque sea estudiante)
    if (this.currentUserData?.isAdmin || this.userRole === 'administrador') {
      sentencia = sentencias.find(s =>
        s.numero_proceso === numero_proceso &&
        s.email_estudiante === email_estudiante
      );
      // Si no lo encuentra exacto, intentar búsqueda más laxa solo por proceso
      if (!sentencia) {
        sentencia = sentencias.find(s => s.numero_proceso === numero_proceso);
      }

      if (!sentencia) {
        console.warn('❌ No se encontró coincidencia exacta para Admin.');
      }
    }
    // PRIORIDAD 2: Roles normales
    else if (this.userRole === 'docente') {
      sentencia = sentencias.find(s =>
        s.numero_proceso === numero_proceso &&
        s.email_docente === this.userEmail
      );
    } else if (this.userRole === 'estudiante') {
      sentencia = sentencias.find(s =>
        s.numero_proceso === numero_proceso &&
        s.email_estudiante === this.userEmail
      );
    }

    if (sentencia) {
      console.log('✅ Sentencia encontrada para editar:', sentencia.id);
      this.router.navigate(['/editar-sentencia'], {
        queryParams: {
          id: sentencia.id,
          numero_proceso: sentencia.numero_proceso,
          email_estudiante: sentencia.email_estudiante,
          email_docente: sentencia.email_docente
        }
      });
    } else {
      console.error('❌ No se encontró la sentencia con los parámetros proporcionados');
      this.showNotification('No se encontró la sentencia para editar.', 'error');
    }
  }

  confirmarEliminacion(sentencia: any) {
    this.sentenciaAEliminar = sentencia;
  }

  cancelarEliminacion() {
    this.sentenciaAEliminar = null;
  }

  eliminarSentenciaConfirmada() {
    const sentencia = this.sentenciaAEliminar as Sentencia; // Castear a Sentencia
    if (!sentencia || !sentencia.id) {
      // Verificar si hay sentencia y si tiene ID
      console.error(
        'No se puede eliminar la sentencia: falta información o ID.'
      );
      this.sentenciaAEliminar = null;
      this.mostrarMensaje('Error al intentar eliminar la sentencia.', true);
      return;
    }

    this.isLoading = true;
    this.firestore
      .collection('sentencias')
      .doc(sentencia.id)
      .delete()
      .then(() => {
        // console.log('Sentencia eliminada correctamente con ID:', sentencia.id);
        this.mostrarMensaje('Sentencia eliminada con éxito.', false);
        this.loadUserData(this.user.uid); // Recargar datos
      })
      .catch((error) => {
        console.error('Error al eliminar la sentencia:', error);
        this.mostrarMensaje('Error al eliminar la sentencia.', true);
      })
      .finally(() => this.isLoading = false);

    this.sentenciaAEliminar = null;
  }

  // Método auxiliar para crear un identificador único de sentencia
  private crearIdentificadorSentencia(sentencia: Sentencia): string {
    return `${sentencia.numero_proceso}_${sentencia.email_estudiante}_${sentencia.email_docente}`;
  }

  // Método para verificar si hay duplicados (útil para debugging)
  async verificarDuplicados(numeroProceso: string) {
    try {
      const snapshot = await this.firestore
        .collection('sentencias')
        .ref.where('numero_proceso', '==', numeroProceso)
        .get();

      // console.log(`📊 Sentencias con número ${numeroProceso}:`, snapshot.docs.length);

      snapshot.docs.forEach((doc, index) => {
        const data = doc.data() as Sentencia;
        console.log(`${index + 1}. ID: ${doc.id}`);
        console.log(`   Estudiante: ${data.nombre_estudiante} (${data.email_estudiante})`);
        console.log(`   Docente: ${data.nombre_docente} (${data.email_docente})`);
        console.log(`   Estado: ${data.estado || 'Pendiente'}`);
        console.log(`   Razón: ${data.razon || 'N/A'}`);
        console.log('---');
      });
    } catch (error) {
      console.error('Error al verificar duplicados:', error);
    }
  }

  // Se eliminó la función generarReporteExcel

  loadPagedSentencias(direction: 'init' | 'next' | 'prev' = 'init') {
    this.loadingPage = true;
    this.isLoading = true; // Mostrar spinner general también si prefieres
    let queryFn: any;
    let userFilter = (ref: any) => ref;

    // ✅ CORRECCIÓN DE FILTRO DE SENTENCIAS PARA ADMIN
    const esAdmin = this.currentUserData?.isAdmin || this.userRole === 'administrador';

    if (esAdmin) {
      // Admin ve todo, no aplicamos filtro a menos que active el toggle
      if (this.soloMisSentencias && this.userEmail) {
        userFilter = (ref: any) => ref.where('email_docente', '==', this.userEmail);
      }
    } else if (this.userRole === 'estudiante' && this.userEmail) {
      userFilter = (ref: any) => ref.where('email_estudiante', '==', this.userEmail);
    } else if (this.userRole === 'docente' && this.userEmail) {
      userFilter = (ref: any) => ref.where('email_docente', '==', this.userEmail);
    }

    if (direction === 'init') {
      queryFn = (ref: any) => userFilter(ref.orderBy('numero_proceso').limit(this.pageSize));
      this.visitedPages = []; // Limpiar array al inicializar
      this.currentPage = 1; // Resetear página actual
    } else if (direction === 'next') {
      const lastDoc = this.visitedPages[this.visitedPages.length - 1];
      if (!lastDoc) return;
      queryFn = (ref: any) => userFilter(ref.orderBy('numero_proceso').startAfter(lastDoc).limit(this.pageSize));
    } else if (direction === 'prev') {
      // Para prev, necesitamos el documento anterior al primer documento de la página actual
      if (this.visitedPages.length < 2) return;
      const prevDoc = this.visitedPages[this.visitedPages.length - 2];
      queryFn = (ref: any) => userFilter(ref.orderBy('numero_proceso').endBefore(prevDoc).limitToLast(this.pageSize));
    }

    this.firestore.collection('sentencias', queryFn).get().subscribe(snapshot => {
      const sentencias = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        const id = doc.id;

        const convertToDate = (field: any) => {
          if (!field) return null;
          if (typeof field.toDate === 'function') return field.toDate();
          if (field.seconds !== undefined && field.nanoseconds !== undefined) {
            return new Date(field.seconds * 1000 + field.nanoseconds / 1000000);
          }
          return field;
        };

        data.fecha_creacion = convertToDate(data.fecha_creacion);
        data.fecha_actualizacion = convertToDate(data.fecha_actualizacion);

        return { ...data, id } as Sentencia;
      });
      this.pagedSentencias = sentencias;

      // Actualizar array de páginas visitadas
      if (sentencias.length > 0) {
        if (direction === 'init') {
          this.visitedPages = [snapshot.docs[snapshot.docs.length - 1]];
        } else if (direction === 'next') {
          this.visitedPages.push(snapshot.docs[snapshot.docs.length - 1]);
        } else if (direction === 'prev') {
          // Remover el último documento del array
          this.visitedPages.pop();
        }
      }

      // Corregir el cálculo del estado de paginación
      this.isFirstPage = this.visitedPages.length <= 1;
      this.isLastPage = sentencias.length < this.pageSize;

      this.loadingPage = false;
      this.isLoading = false;
      this.checkCalificacionStatus();
    });
  }

  // NUEVO: Método para consultar si el docente ya guardó sus calificaciones
  checkCalificacionStatus() {
    this.pagedSentencias.forEach(sentencia => {
      const np = sentencia.numero_proceso;
      // Solo consultar si no se había consultado antes para este numero_proceso
      if (!this.progresoCalificacion[np]) {
        this.progresoCalificacion[np] = { analisis: false, analisis2: false, evaluacion: false, evaluacion2: false };
        
        const colecciones = ['analisis', 'analisis2', 'evaluacion', 'evaluacion2'];
        
        colecciones.forEach(col => {
          this.firestore.collection(col).doc(np).get().subscribe(doc => {
            if (doc.exists) {
              const data = doc.data() as any;
              if (data.docenteSaved) {
                // Actualizar la propiedad específica de la sección
                this.progresoCalificacion[np][col as keyof typeof this.progresoCalificacion[string]] = true;
              }
            }
          });
        });
      }
    });
  }

  // Métodos de navegación
  nextPage() {
    if (this.isLastPage) return;
    this.currentPage++;
    this.loadPagedSentencias('next');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  prevPage() {
    if (this.isFirstPage || this.visitedPages.length < 2) return;
    this.currentPage--;
    this.loadPagedSentencias('prev');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  // Método para cargar resultados de búsqueda


  // Método para navegar en resultados de búsqueda
  nextSearchPage() {
    if (this.isSearchMode && this.hasMorePages) {
      this.currentPage++;
      this.loadSearchResults();
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    }
  }

  prevSearchPage() {
    if (this.isSearchMode && !this.isFirstPage) {
      this.currentPage--;
      this.loadSearchResults();
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    }
  }

  // Método para debuggear datos
  debugData() {
    console.log('🔍 === DEBUG DATA ===');
    console.log('🔍 userRole:', this.userRole);
    console.log('🔍 userEmail:', this.userEmail);
    console.log('🔍 searchText:', this.searchText);
    console.log('🔍 isSearchMode:', this.isSearchMode);
    console.log('🔍 searchResults.length:', this.searchResults.length);
    console.log('🔍 pagedSentencias.length:', this.pagedSentencias.length);

    const allSentencias = this._allSentencias.getValue();
    console.log('🔍 Total sentencias cargadas:', allSentencias.length);

    if (allSentencias.length > 0) {
      console.log('🔍 Primera sentencia de ejemplo:', allSentencias[0]);
    }

    if (this.searchResults.length > 0) {
      console.log('🔍 Primer resultado de búsqueda:', this.searchResults[0]);
    }
  }
}