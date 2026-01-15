import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import * as Papa from 'papaparse';
import { map } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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
  styleUrls: ['./admin-periodos.component.css']
})
export class AdminPeriodosComponent implements OnInit {

  showModal: boolean = false;
  cicloSeleccionado: string = 'abril - agosto';
  anioInput: number = new Date().getFullYear();
  previewNombre: string = '';

  periodos: Periodo[] = [];
  periodoActivoActual: Periodo | null = null;
  periodoReporteSeleccionado: Periodo | null = null;

  archivoSeleccionado: File | null = null;
  isLoading: boolean = false;
  alert: string = '';
  alertype: 'success' | 'error' = 'success';

  constructor(
    private firestore: AngularFirestore,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.cargarPeriodos();
    this.actualizarPreview();
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
    this.firestore.collection('periodoAcademico')
      .snapshotChanges()
      .pipe(
        map(actions => actions.map(a => {
          const data = a.payload.doc.data() as any;
          const id = a.payload.doc.id;
          return {
            id,
            ...data,
            anio_inicio: data.anio_inicio || 0
          };
        }))
      )
      .subscribe((data: any[]) => {
        const periodosValidos = data.filter(p => p.anio_inicio > 2000);

        this.periodos = periodosValidos.sort((a, b) => {
          if (b.anio_inicio !== a.anio_inicio) {
            return b.anio_inicio - a.anio_inicio;
          }
          const mesA = a.ciclo.includes('octubre') ? 10 : 4;
          const mesB = b.ciclo.includes('octubre') ? 10 : 4;
          return mesB - mesA;
        });

        const activoEnRaw = data.find(p => p.activo);
        this.periodoActivoActual = activoEnRaw || null;

        this.isLoading = false;
      }, error => {
        console.error("Error cargando periodos", error);
        this.isLoading = false;
      });
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

    const existe = this.periodos.some(p => p.nombre === nombreFinal);
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
        fecha_creacion: new Date()
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

    if (!confirm(`¿Confirmar activación de: "${periodo.nombre}"?\nEsto desactivará el periodo actual.`)) {
      return;
    }

    try {
      this.isLoading = true;
      const batch = this.firestore.firestore.batch();

      const activosQuery = await this.firestore.collection('periodoAcademico').ref.where('activo', '==', true).get();
      activosQuery.forEach(doc => {
        batch.update(doc.ref, { activo: false });
      });

      const nuevoRef = this.firestore.collection('periodoAcademico').doc(periodo.id).ref;
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
      this.showNotification('⚠️ ERROR: Active un periodo antes de cargar docentes.', 'error');
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
          const email = row.email?.trim().toLowerCase() || row.correos?.trim().toLowerCase();
          const nombres = row.nombres || row.nombres_completos || '';
          const modalidad = row.modalidad || '';

          if (!email) continue;

          const docRef = collectionRef.doc(email).ref;
          batch.set(docRef, {
            email: email,
            nombres: nombres,
            periodo_academico: periodoParaGuardar,
            modalidad: modalidad,
            fecha_carga: new Date()
          }, { merge: true });

          count++;
        }

        if (count > 0) {
          await batch.commit();
          this.showNotification(`Cargados ${count} docentes a: ${periodoParaGuardar}`, 'success');
        } else {
          this.showNotification('Archivo inválido.', 'error');
        }

        input.value = '';
        this.isLoading = false;
      },
      error: (err: any) => {
        this.showNotification('Error al leer CSV.', 'error');
        this.isLoading = false;
      }
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
      const snapshot = await this.firestore.collection('sentencias', ref =>
        ref.where('periodo_academico', '==', nombrePeriodo)
      ).get().toPromise();

      if (!snapshot || snapshot.empty) {
        this.showNotification(`No hay sentencias en ${nombrePeriodo}`, 'error');
        this.isLoading = false;
        return;
      }

      const sentenciasBasicas = snapshot.docs.map(doc => doc.data());

      // 2. Obtener el estado de los cuestionarios en paralelo (CRUCE DE DATOS)
      const datosCompletos = await Promise.all(sentenciasBasicas.map(async (s: any) => {
        const numProceso = s.numero_proceso ? String(s.numero_proceso).trim() : '';

        // Si no hay número de proceso, devolvemos todo en falso
        if (!numProceso) {
          return {
            ...s,
            analisis1_ok: false, analisis2_ok: false,
            evaluacion1_ok: false, evaluacion2_ok: false
          };
        }

        // Consultamos las 4 colecciones
        const [analisisSnap, analisis2Snap, evaluacionSnap, evaluacion2Snap] = await Promise.all([
          this.firestore.collection('analisis').doc(numProceso).get().toPromise(),
          this.firestore.collection('analisis2').doc(numProceso).get().toPromise(),
          this.firestore.collection('evaluacion').doc(numProceso).get().toPromise(),
          this.firestore.collection('evaluacion2').doc(numProceso).get().toPromise()
        ]);

        // Verificamos 'saved: true'
        const checkSaved = (snap: any) => snap?.exists && (snap.data()?.saved === true);

        return {
          ...s,
          analisis1_ok: checkSaved(analisisSnap),
          analisis2_ok: checkSaved(analisis2Snap),
          evaluacion1_ok: checkSaved(evaluacionSnap),
          evaluacion2_ok: checkSaved(evaluacion2Snap)
        };
      }));

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
        'Nombre Docente Antiguo', // Campo extra 1
        'Correo Docente Antiguo', // Campo extra 2
        'Fecha de Actualización', // Campo extra 3
        'Actualizado Por',        // Campo extra 4
        'Completado Análisis 1',  // Nuevo Check
        'Completado Análisis 2',  // Nuevo Check
        'Completado Evaluación 1',// Nuevo Check
        'Completado Evaluación 2' // Nuevo Check
      ]);

      datosCompletos.forEach((s: any) => {
        // Formatear fecha
        let fecha = '';
        if (s.fecha_actualizacion) {
          const fechaObj = s.fecha_actualizacion.toDate ? s.fecha_actualizacion.toDate() : new Date(s.fecha_actualizacion);
          fecha = fechaObj.toLocaleDateString() + ' ' + fechaObj.toLocaleTimeString();
        }

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

          // BOLEANOS (TRUE/FALSE)
          s.analisis1_ok ? '1' : '0',
          s.analisis2_ok ? '1' : '0',
          s.evaluacion1_ok ? '1' : '0',
          s.evaluacion2_ok ? '1' : '0'
        ]);
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(datosExcel);

      // Ajustar anchos de columna para que se vea bien
      const wscols = [
        { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
        { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 40 }, { wch: 25 },
        { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 25 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
      ];
      worksheet['!cols'] = wscols;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      saveAs(blob, `Reporte_Completo_${nombrePeriodo}.xlsx`);
      this.showNotification('Reporte descargado correctamente.', 'success');

    } catch (error) {
      console.error('Error generando reporte:', error);
      this.showNotification('Error al generar el reporte.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  showNotification(message: string, type: 'success' | 'error') {
    this.alert = message;
    this.alertype = type;
    setTimeout(() => { this.alert = ''; }, 4000);
  }

  volver() {
    this.router.navigate(['/principal']);
  }
}