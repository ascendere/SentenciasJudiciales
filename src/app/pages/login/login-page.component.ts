import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { catchError, first, Observable, Subscription, switchMap, throwError } from 'rxjs';
import { AuthService, UserData } from '../../services/auth.service';
import { AuthenticationResult } from '@azure/msal-browser';
import { MsalService } from '@azure/msal-angular';
import firebase from 'firebase/compat/app';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css']
})


export class LoginPageComponent implements OnInit, OnDestroy {
  alerta: boolean = false;
  isLogin = true;
  alertaMessage = '';
  private authStateSubscription: Subscription | undefined;
  mostrarFormAlternativo: boolean = false;

  constructor(
    private afAuth: AngularFireAuth,
    private authService: AuthService, // Asegúrate de que esto está importado e inyectado
    private router: Router,
    private firestore: AngularFirestore,
    private msalService: MsalService
  ) { }

  onLogin() {
    this.authService.login();
  }

  ngOnInit() {
    this.authStateSubscription = this.afAuth.authState.subscribe(user => {
      if (user) {
        sessionStorage.setItem('sessionToken', 'active');
        sessionStorage.setItem('userId', user.uid);
        this.router.navigate(['/principal']);
      } else {
        sessionStorage.removeItem('sessionToken');
        sessionStorage.removeItem('userId');
      }
      if (user && this.authService.isAuthenticated()) {
        this.router.navigate(['/principal']);
      }
    });

    if (sessionStorage.getItem('sessionToken') === 'active') {
      this.router.navigate(['/principal']);
    }
  }

  ngOnDestroy() {
    if (this.authStateSubscription) {
      this.authStateSubscription.unsubscribe();
    }
  }

  /**
   * Inicia sesión con correo y contraseña (Firebase).
   * Inyecta lógica para verificar si el usuario debe ser 'docente' al loguearse.
   */
  login(email: string, password: string) {
    this.afAuth.signInWithEmailAndPassword(email, password)
      .then(async (userCredential) => {
        // INYECCIÓN DE LÓGICA: Verificar rol antes de navegar
        if (userCredential.user && userCredential.user.email) {
          await this.authService.verificarAscensoDocente(userCredential.user.uid, userCredential.user.email);
        }

        sessionStorage.setItem('sessionToken', 'active');
        this.router.navigate(['/principal']);
      })
      .catch(error => {
        // console.error('Login error:', error);
        this.alerta = true;
      });
  }

  /**
   * Inicia sesión con cuenta de Microsoft (Azure).
   * 1. Limpieza de duplicados: Elimina cuentas antiguas si existen.
   * 2. Guarda/Actualiza usuario en la colección local.
   * 3. Verifica si el usuario está autorizado como docente.
   */
  loginWithAzure() {
    const microsoftProvide = new firebase.auth.OAuthProvider("microsoft.com")
    microsoftProvide.setCustomParameters({ tenant: "6eeb49aa-436d-43e6-becd-bbdf79e5077d" })
    microsoftProvide.addScope('user.read')
    microsoftProvide.addScope('openid')
    microsoftProvide.addScope('profile')

    this.afAuth.signInWithPopup(microsoftProvide)
      .then(async (response) => {
        const profile = response.additionalUserInfo?.profile as any;
        const azureUserId = response.user?.uid;
        const azureUserEmail = (profile.mail || profile.userPrincipalName || response.user?.email || '').toLowerCase();

        if (!azureUserId) return;

        // 1. LÓGICA DE LIMPIEZA DE DUPLICADOS (Mantenemos tu lógica original que funcionaba)
        const emailPasswordUsers = await this.firestore.collection('users',
          ref => ref.where('email', '==', azureUserEmail)
        ).get().toPromise();

        let currentRole = 'estudiante';
        let existingUserIds: string[] = [];

        if (emailPasswordUsers && emailPasswordUsers.docs.length > 0) {
          for (let doc of emailPasswordUsers.docs) {
            const userData = doc.data() as UserData;
            if (userData.role === 'docente') currentRole = 'docente';
            if (userData.role === 'administrador') currentRole = 'administrador';
            if (doc.id !== azureUserId) existingUserIds.push(doc.id);
          }

          for (let userId of existingUserIds) {
            try {
              await this.firestore.collection('users').doc(userId).delete();
            } catch (firestoreError) {
              console.error('Error eliminando documento:', firestoreError);
            }
          }
        }

        // 2. GUARDAR USUARIO DE AZURE
        const azureUserData = {
          name: profile.displayName || profile.name,
          email: azureUserEmail,
          role: currentRole
        };
        await this.firestore.collection('users').doc(azureUserId).set(azureUserData, { merge: true });

        // 3. INYECCIÓN DE LÓGICA NUEVA: Verificar si debe subir a docente AHORA
        // (Por si acaba de entrar y está en el CSV)
        await this.authService.verificarAscensoDocente(azureUserId, azureUserEmail);

        this.router.navigate(['/principal']);
      })
      .catch(error => {
        console.error('Error en inicio de sesión con Azure:', error);
      });
  }

  // REGISTRO CON FIREBASE
  async register(name: string, email: string, password: string) {
    try {
      const querySnapshot = await this.firestore.collection('users', ref => ref.where('email', '==', email)).get().toPromise();

      let existingUserData: UserData | null = null;

      if (querySnapshot && !querySnapshot.empty) {
        existingUserData = querySnapshot.docs[0].data() as UserData;
      }

      const userCredential = await this.afAuth.createUserWithEmailAndPassword(email, password);
      const newUserId = userCredential.user?.uid;

      if (!newUserId) throw new Error("No se pudo obtener el UID.");

      if (existingUserData && (existingUserData.role === 'docente' || existingUserData.role === 'administrador')) {
        await this.firestore.collection('users').doc(newUserId).set({
          name: existingUserData.name,
          email: email,
          role: existingUserData.role
        }, { merge: true });
      } else {
        await this.firestore.collection('users').doc(newUserId).set({
          name: name.toUpperCase(),
          email: email,
          role: 'estudiante'
        });
      }

      // INYECCIÓN DE LÓGICA: Verificar rol al registrarse
      await this.authService.verificarAscensoDocente(newUserId, email);

      sessionStorage.setItem('sessionToken', 'active');
      this.router.navigate(['/principal']);

    } catch (error) {
      console.error('Error en el registro:', error);
      this.alerta = true;
      this.alertaMessage = 'No se pudo registrar. Verifica si el correo ya está en uso.';
    }
  }

  toggleForm(event: Event) {
    event.preventDefault();
    this.isLogin = !this.isLogin;
    this.alerta = false;
  }
}