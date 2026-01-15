import { Component, OnInit, OnDestroy } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class HeaderComponent implements OnInit, OnDestroy {
  user: any = null;
  showLogoutMenu = false;
  defaultProfilePic = 'assets/default-profile-pic.png';

  periodoActual: string = 'Cargando...';
  private periodoSub: Subscription | undefined; // Para guardar la conexión

  constructor(
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    // Suscripción al periodo activo para mostrarlo en el header
    this.periodoSub = this.authService.listenToPeriodoActivo().subscribe(periodo => {
      this.periodoActual = periodo;
    });

    this.afAuth.authState.subscribe(user => {
      if (user) {
        // Obtener datos extendidos del usuario para mostrar nombre y rol
        this.firestore.collection('users').doc(user.uid).valueChanges().subscribe(userData => {
          this.user = userData;
        });
      }
    });
  }

  ngOnDestroy(): void {
    if (this.periodoSub) {
      this.periodoSub.unsubscribe();
    }
  }

  toggleLogoutMenu() {
    this.showLogoutMenu = !this.showLogoutMenu;
  }

  logout() {
    this.authService.logout().then(() => {
      this.router.navigate(['/login']);
    });
  }
}