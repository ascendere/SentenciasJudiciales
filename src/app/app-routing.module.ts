import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginPageComponent } from './pages/login/login-page.component';
import { PrincipalPageComponent } from './pages/principal/principal-page.component';
import { SentenciasPageComponent } from './pages/sentencias/sentencias-page.component.';
import { AnalisisComponent } from './pages/analisis/analisis.component';
import { Analisis2Component } from './pages/analisis2/analisis2.component';
import { EvaluacionComponent } from './pages/evaluacion/evaluacion.component';
import { Evaluacion2Component } from './pages/evaluacion2/evaluacion2.component';
import { EditarSentenciaComponent } from './pages/editar-sentencia/editar-sentencia.component';
import { AdminGuard } from './guards/admin.guard';
import { SentenceOwnerGuard } from './guards/sentence-owner.guard';


export const routes: Routes = [
  // Redirección por defecto al login
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  // Rutas públicas
  { path: 'login', component: LoginPageComponent },

  // Rutas principales protegidas (La protección se maneja en los componentes o por redirección)
  { path: 'principal', component: PrincipalPageComponent },

  // Rutas de flujo de sentencias (protegidas por SentenceOwnerGuard)
  { path: 'nueva-sentencia', component: SentenciasPageComponent },
  { path: 'analisis', component: AnalisisComponent, canActivate: [SentenceOwnerGuard] },
  { path: 'analisis2', component: Analisis2Component, canActivate: [SentenceOwnerGuard] },
  { path: 'evaluacion', component: EvaluacionComponent, canActivate: [SentenceOwnerGuard] },
  { path: 'evaluacion2', component: Evaluacion2Component, canActivate: [SentenceOwnerGuard] },
  { path: 'editar-sentencia', component: EditarSentenciaComponent, canActivate: [SentenceOwnerGuard] },

  // Módulo de Administración (Carga perezosa y protegido por AdminGuard)
  { path: 'admin', loadChildren: () => import('./pages/admin/admin.module').then(m => m.AdminModule), canActivate: [AdminGuard] },
  { path: 'administrar', redirectTo: 'admin/periodos', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
