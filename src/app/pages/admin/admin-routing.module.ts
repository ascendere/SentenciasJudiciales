import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminPeriodosComponent } from './admin-periodos/admin-periodos.component';

const routes: Routes = [
    {
        path: '',
        children: [
            // Ruta por defecto del módulo admin -> Periodos
            { path: 'periodos', component: AdminPeriodosComponent },
            { path: '', redirectTo: 'periodos', pathMatch: 'full' }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AdminRoutingModule { }
