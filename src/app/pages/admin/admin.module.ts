import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRoutingModule } from './admin-routing.module';
import { AdminPeriodosComponent } from './admin-periodos/admin-periodos.component';

import { HeaderComponent } from '../../components/header/header.component';
import { FooterComponent } from '../../components/footer/footer.component';

@NgModule({
    declarations: [
        AdminPeriodosComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        AdminRoutingModule,
        HeaderComponent,
        FooterComponent
    ]
})
/**
 * Módulo de Administración.
 * Gestiona la funcionalidad relacionada con los administradores, como la gestión de periodos y docentes.
 * Se carga de manera perezosa (Lazy Loading) para optimizar el rendimiento.
 */
export class AdminModule { }
