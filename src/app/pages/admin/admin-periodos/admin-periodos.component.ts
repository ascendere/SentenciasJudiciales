import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import * as Papa from 'papaparse';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { finalize } from 'rxjs/operators';

interface Periodo {
  id?: string;
  nombre: string;
  ciclo: string;
  anio_inicio: number;
  anio_fin: number;
  activo: boolean;
  fecha_creacion?: any;
}

@Component({
  selector: 'app-admin-periodos',
  templateUrl: './admin-periodos.component.html',
  styleUrls: ['./admin-periodos.component.css'],
})
export class AdminPeriodosComponent implements OnInit, OnDestroy {
  showModal: boolean = false;
  cicloSeleccionado: string = 'abril - agosto';
  anioInput: number = new Date().getFullYear();
  previewNombre: string = '';

  periodos: Periodo[] = [];
  periodoActivoActual: Periodo | null = null;
  periodoReporteSeleccionado: Periodo | null = null;
  periodoBorradoSeleccionado: Periodo | null = null;

  archivoSeleccionado: File | null = null;
  isLoading: boolean = false;
  alert: string = '';
  alertype: 'success' | 'error' = 'success';

  private destroy$ = new Subject<void>();

  constructor(
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarPeriodos();
    this.actualizarPreview();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get periodosPasados(): Periodo[] {
    const list = this.periodos.filter((p) => !p.activo);
    // Añadimos una opción virtual para sentencias sin periodo asignado
    list.push({
      id: '_SIN_PERIODO_',
      nombre: 'Sin Periodo / No especificado',
      ciclo: '',
      anio_inicio: 0,
      anio_fin: 0,
      activo: false,
    });
    return list;
  }

  abrirModal() {
    this.cicloSeleccionado = 'abril - agosto';
    this.anioInput = new Date().getFullYear();
    this.actualizarPreview();
    this.showModal = true;
  }

  cerrarModal() {
    this.showModal = false;
  }

  actualizarPreview() {
    if (!this.anioInput) return;

    if (this.cicloSeleccionado === 'abril - agosto') {
      this.previewNombre = `abril - agosto ${this.anioInput}`;
    } else {
      const anioFin = this.anioInput + 1;
      this.previewNombre = `octubre ${this.anioInput} - febrero ${anioFin}`;
    }
  }

  /*
   * 1. CARGAR LISTA DE PERIODOS
   * Obtiene los periodos desde Firestore, filtra los inválidos (año < 2000)
   * y los ordena (primero por año descendente, luego por ciclo).
   */
  cargarPeriodos() {
    this.isLoading = true;
    this.firestore
      .collection('periodoAcademico')
      .snapshotChanges()
      .pipe(
        takeUntil(this.destroy$),
        map((actions) =>
          actions.map((a) => {
            const data = a.payload.doc.data() as any;
            const id = a.payload.doc.id;
            return {
              id,
              ...data,
              anio_inicio: data.anio_inicio || 0,
            };
          }),
        ),
      )
      .subscribe(
        (data: any[]) => {
          const periodosValidos = data.filter((p) => p.anio_inicio > 2000);

          this.periodos = periodosValidos.sort((a, b) => {
            if (b.anio_inicio !== a.anio_inicio) {
              return b.anio_inicio - a.anio_inicio;
            }
            const mesA = a.ciclo.includes('octubre') ? 10 : 4;
            const mesB = b.ciclo.includes('octubre') ? 10 : 4;
            return mesB - mesA;
          });

          const activoEnRaw = data.find((p) => p.activo);
          this.periodoActivoActual = activoEnRaw || null;

          this.isLoading = false;
        },
        (error) => {
          console.error('Error cargando periodos', error);
          this.isLoading = false;
        },
      );
  }

  async crearPeriodo() {
    if (!this.anioInput || this.anioInput < 2000 || this.anioInput > 2100) {
      this.showNotification('Ingrese un año válido.', 'error');
      return;
    }

    let anioFin = this.anioInput;
    if (this.cicloSeleccionado === 'octubre - febrero') {
      anioFin = this.anioInput + 1;
    }
    const nombreFinal = this.previewNombre;

    const existe = this.periodos.some((p) => p.nombre === nombreFinal);
    if (existe) {
      this.showNotification('Este periodo ya existe en la lista.', 'error');
      return;
    }

    try {
      this.isLoading = true;
      const nuevoPeriodo = {
        nombre: nombreFinal,
        ciclo: this.cicloSeleccionado,
        anio_inicio: this.anioInput,
        anio_fin: anioFin,
        activo: false,
        fecha_creacion: new Date(),
      };

      await this.firestore.collection('periodoAcademico').add(nuevoPeriodo);
      this.showNotification('Periodo creado exitosamente.', 'success');
      this.cerrarModal();
    } catch (error) {
      console.error(error);
      this.showNotification('Error al crear periodo.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async activarPeriodo(periodo: Periodo) {
    if (!periodo.id) return;
    if (periodo.activo) return;

    if (
      !confirm(
        `¿Confirmar activación de: "${periodo.nombre}"?\nEsto desactivará el periodo actual.`,
      )
    ) {
      return;
    }

    try {
      this.isLoading = true;
      const batch = this.firestore.firestore.batch();

      const activosQuery = await this.firestore
        .collection('periodoAcademico')
        .ref.where('activo', '==', true)
        .get();
      activosQuery.forEach((doc) => {
        batch.update(doc.ref, { activo: false });
      });

      const nuevoRef = this.firestore
        .collection('periodoAcademico')
        .doc(periodo.id).ref;
      batch.update(nuevoRef, { activo: true });

      await batch.commit();
      this.showNotification(`Periodo activo: ${periodo.nombre}`, 'success');
    } catch (error) {
      this.showNotification('Error al cambiar estado.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  onFileSelected(event: any) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;

    if (!this.periodoActivoActual) {
      this.showNotification(
        '⚠️ ERROR: Active un periodo antes de cargar docentes.',
        'error',
      );
      input.value = '';
      return;
    }

    this.isLoading = true;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result: { data: any[] }) => {
        const rows = result.data;
        const batch = this.firestore.firestore.batch();
        let count = 0;
        const collectionRef = this.firestore.collection('docentes_autorizados');
        const periodoParaGuardar = this.periodoActivoActual?.nombre || '';

        for (const row of rows) {
          const email =
            row.email?.trim().toLowerCase() ||
            row.correos?.trim().toLowerCase();
          const nombres = row.nombres || row.nombres_completos || '';
          const modalidad = row.modalidad || '';

          if (!email) continue;

          const docRef = collectionRef.doc(email).ref;
          batch.set(
            docRef,
            {
              email: email,
              nombres: nombres,
              periodo_academico: periodoParaGuardar,
              modalidad: modalidad,
              fecha_carga: new Date(),
            },
            { merge: true },
          );

          count++;
        }

        if (count > 0) {
          await batch.commit();
          this.showNotification(
            `Cargados ${count} docentes a: ${periodoParaGuardar}`,
            'success',
          );
        } else {
          this.showNotification('Archivo inválido.', 'error');
        }

        input.value = '';
        this.isLoading = false;
      },
      error: (err: any) => {
        this.showNotification('Error al leer CSV.', 'error');
        this.isLoading = false;
      },
    });
  }

  /**
   * Genera y descarga un reporte en Excel.
   * Realiza un cruce de datos entre la colección 'sentencias' y las colecciones
   * de 'analisis', 'analisis2', 'evaluacion' y 'evaluacion2' para verificar progreso.
   */
  async descargarReporte() {
    if (!this.periodoReporteSeleccionado) {
      this.showNotification('Seleccione un periodo para el reporte.', 'error');
      return;
    }

    const nombrePeriodo = this.periodoReporteSeleccionado.nombre;
    this.isLoading = true;

    try {
      console.log(`Generando reporte completo para: ${nombrePeriodo}`);

      // 1. Obtener sentencias del periodo
      const snapshot = await this.firestore
        .collection('sentencias', (ref) =>
          ref.where('periodo_academico', '==', nombrePeriodo),
        )
        .get()
        .toPromise();

      if (!snapshot || snapshot.empty) {
        this.showNotification(`No hay sentencias en ${nombrePeriodo}`, 'error');
        this.isLoading = false;
        return;
      }

      const sentenciasBasicas = snapshot.docs.map((doc) => doc.data());

      // 2. Obtener el estado de los cuestionarios en paralelo (CRUCE DE DATOS)
      // PROCESAMOS POR LOTES (CHUNKS) PARA NO AGOTAR RECURSOS DE FIRESTORE
      const datosCompletos: any[] = [];
      const CHUNK_SIZE = 10;

      for (let i = 0; i < sentenciasBasicas.length; i += CHUNK_SIZE) {
        const chunk = sentenciasBasicas.slice(i, i + CHUNK_SIZE);

        const chunkResult = await Promise.all(
          chunk.map(async (s: any) => {
            const numProceso = s.numero_proceso
              ? String(s.numero_proceso).trim()
              : '';

            if (!numProceso) {
              return {
                ...s,
                analisis1_st: false,
                analisis2_st: false,
                evaluacion1_st: false,
                evaluacion2_st: false,
                analisis1_doc: false,
                analisis2_doc: false,
                evaluacion1_doc: false,
                evaluacion2_doc: false,
              };
            }

            // Consultamos las 4 colecciones
            const [
              analisisSnap,
              analisis2Snap,
              evaluacionSnap,
              evaluacion2Snap,
            ] = await Promise.all([
              this.firestore
                .collection('analisis')
                .doc(numProceso)
                .get()
                .toPromise(),
              this.firestore
                .collection('analisis2')
                .doc(numProceso)
                .get()
                .toPromise(),
              this.firestore
                .collection('evaluacion')
                .doc(numProceso)
                .get()
                .toPromise(),
              this.firestore
                .collection('evaluacion2')
                .doc(numProceso)
                .get()
                .toPromise(),
            ]);

            const checkStudentSaved = (snap: any) =>
              snap?.exists && snap.data()?.saved === true;
            const checkDocenteSaved = (snap: any) =>
              snap?.exists && snap.data()?.docenteSaved === true;

            return {
              ...s,
              analisis1_st: checkStudentSaved(analisisSnap),
              analisis1_doc: checkDocenteSaved(analisisSnap),
              analisis2_st: checkStudentSaved(analisis2Snap),
              analisis2_doc: checkDocenteSaved(analisis2Snap),
              evaluacion1_st: checkStudentSaved(evaluacionSnap),
              evaluacion1_doc: checkDocenteSaved(evaluacionSnap),
              evaluacion2_st: checkStudentSaved(evaluacion2Snap),
              evaluacion2_doc: checkDocenteSaved(evaluacion2Snap),
            };
          }),
        );

        datosCompletos.push(...chunkResult);
        console.log(
          `Procesado chunk: ${i + chunk.length} de ${sentenciasBasicas.length}`,
        );
      }

      // 3. Preparar Excel con TODAS las columnas
      const datosExcel = [];

      // ENCUESTA COMPLETA DE CABECERAS
      datosExcel.push([
        'Nombre Docente',
        'Correo Docente',
        'Nombre Estudiante',
        'Correo Estudiante',
        'Número de Proceso',
        'Asunto',
        'Estado',
        'Razón/Veredicto',
        'Periodo Académico',
        'Nombre Docente Antiguo',
        'Correo Docente Antiguo',
        'Fecha de Actualización',
        'Actualizado Por',
        'Completado Análisis 1 (Estudiante)',
        'Completado Análisis 2 (Estudiante)',
        'Completado Evaluación 1 (Estudiante)',
        'Completado Evaluación 2 (Estudiante)',
        'Completado Análisis 1 (Docente)',
        'Completado Análisis 2 (Docente)',
        'Completado Evaluación 1 (Docente)',
        'Completado Evaluación 2 (Docente)',
      ]);

      datosCompletos.forEach((s: any) => {
        // Formatear fecha
        let fecha = '';
        if (s.fecha_actualizacion) {
          const fechaObj = s.fecha_actualizacion.toDate
            ? s.fecha_actualizacion.toDate()
            : new Date(s.fecha_actualizacion);
          fecha =
            fechaObj.toLocaleDateString() + ' ' + fechaObj.toLocaleTimeString();
        }

        const formatStatus = (val: boolean) =>
          val ? 'Completado' : 'No completado';

        datosExcel.push([
          s.nombre_docente || '',
          s.email_docente || '',
          s.nombre_estudiante || '',
          s.email_estudiante || '',
          s.numero_proceso || '',
          s.asunto || '',
          s.estado || 'Pendiente',
          s.razon || '',
          s.periodo_academico || '',
          s.nombre_docente_antiguo || '',
          s.email_docente_antiguo || '',
          fecha,
          s.editado_por || s.actualizado_por || '',

          // ESTADOS DE COMPLETADO (TEXTO)
          formatStatus(s.analisis1_st),
          formatStatus(s.analisis2_st),
          formatStatus(s.evaluacion1_st),
          formatStatus(s.evaluacion2_st),
          formatStatus(s.analisis1_doc),
          formatStatus(s.analisis2_doc),
          formatStatus(s.evaluacion1_doc),
          formatStatus(s.evaluacion2_doc),
        ]);
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(datosExcel);

      // Ajustar anchos de columna para que se vea bien
      const wscols = [
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 20 },
        { wch: 30 },
        { wch: 15 },
        { wch: 40 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 20 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
        { wch: 25 },
      ];
      worksheet['!cols'] = wscols;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');

      const excelBuffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'array',
      });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      saveAs(blob, `Reporte_Completo_${nombrePeriodo}.xlsx`);
      this.showNotification('Reporte descargado correctamente.', 'success');
    } catch (error) {
      console.error('Error generando reporte:', error);
      this.showNotification('Error al generar el reporte.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Borra todos los PDFs almacenados en Storage para un periodo seleccionado.
   * También limpia el campo archivoURL en Firestore sin borrar la sentencia.
   */
  async borrarPdfsPorPeriodo() {
    if (!this.periodoBorradoSeleccionado) {
      this.showNotification('Seleccione un periodo para el borrado.', 'error');
      return;
    }

    const nombrePeriodo = this.periodoBorradoSeleccionado.nombre;
    const confirmacion = window.confirm(
      `¿Está seguro de que desea borrar TODOS los archivos PDF del periodo "${nombrePeriodo}"?\n\nEsta acción NO se puede deshacer.`,
    );

    if (!confirmacion) return;

    this.isLoading = true;
    try {
      console.log(`Iniciando borrado de PDFs para: ${nombrePeriodo}`);

      let docsParaBorrar: any[] = [];

      if (this.periodoBorradoSeleccionado.id === '_SIN_PERIODO_') {
        // CASO ESPECIAL: Sentencias sin periodo (campo faltante, vacío o etiquetas genéricas)
        // Para detectar campos faltantes, obtenemos todas las que tengan archivoURL y filtramos en el cliente
        const fullSnapshot = await this.firestore
          .collection('sentencias', (ref) => ref.where('archivoURL', '!=', ''))
          .get()
          .toPromise();

        if (fullSnapshot) {
          docsParaBorrar = fullSnapshot.docs.filter((doc) => {
            const data = doc.data() as any;
            const p = data.periodo_academico;
            return (
              !p || p === '' || p === 'No especificado' || p === 'sin periodo'
            );
          });
        }
      } else {
        // CASO NORMAL: Por nombre de periodo específico
        const snapshot = await this.firestore
          .collection('sentencias', (ref) =>
            ref
              .where('periodo_academico', '==', nombrePeriodo)
              .where('archivoURL', '!=', ''),
          )
          .get()
          .toPromise();

        if (snapshot) {
          docsParaBorrar = snapshot.docs as any[];
        }
      }

      if (docsParaBorrar.length === 0) {
        this.showNotification(
          `No se encontraron archivos PDF para borrar en ${nombrePeriodo}.`,
          'success',
        );
        this.isLoading = false;
        return;
      }

      const totalSentencias = docsParaBorrar.length;
      console.log(
        `Se encontraron ${totalSentencias} sentencias con archivos para borrar.`,
      );

      // 2. Procesar por lotes (chunks)
      const CHUNK_SIZE = 10;
      let procesados = 0;

      for (let i = 0; i < totalSentencias; i += CHUNK_SIZE) {
        const chunk = docsParaBorrar.slice(i, i + CHUNK_SIZE);

        await Promise.all(
          chunk.map(async (doc) => {
            const data = doc.data() as any;
            const url = data.archivoURL;

            if (url) {
              try {
                // A. Borrar de Storage
                // Usamos refFromURL para obtener la referencia a partir de la URL de descarga
                const fileRef = this.storage.refFromURL(url);
                await fileRef.delete().toPromise();

                // B. Actualizar Firestore para quitar el link
                await doc.ref.update({
                  archivoURL: '',
                  fecha_actualizacion: new Date(),
                  actualizado_por: 'Admin (Borrrado Masivo PDF)',
                });
              } catch (err) {
                console.error(`Error procesando sentencia ${doc.id}:`, err);
              }
            }
          }),
        );

        procesados += chunk.length;
        console.log(`Procesados: ${procesados} de ${totalSentencias}`);
      }

      this.showNotification(
        `Se han borrado ${totalSentencias} archivos PDF exitosamente de ${nombrePeriodo}.`,
        'success',
      );
    } catch (error) {
      console.error('Error en el proceso de borrado:', error);
      this.showNotification(
        'Ocurrió un error al intentar borrar los archivos.',
        'error',
      );
    } finally {
      this.isLoading = false;
      this.periodoBorradoSeleccionado = null; // Limpiar selección
    }
  }

  showNotification(message: string, type: 'success' | 'error') {
    this.alert = message;
    this.alertype = type;
    setTimeout(() => {
      this.alert = '';
    }, 4000);
  }

  volver() {
    this.router.navigate(['/principal']);
  }
}
