// auth.service.ts
import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { MsalService } from '@azure/msal-angular';
import { AuthenticationResult } from '@azure/msal-browser';
import { Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

export interface UserData {
  uid?: string;
  name: string;
  email: string;
  role: string;
  isAdmin?: boolean;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  router: any;

  constructor(
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
    private msalService: MsalService
  ) { }

  // OBTENER PERIODO ACTIVO (DESDE LA BASE DE DATOS)
  public async obtenerPeriodoActivo(): Promise<string> {
    try {
      // Buscamos en la colección 'periodoAcademico' el documento marcado como activo
      const snapshot = await this.firestore.collection('periodoAcademico', ref =>
        ref.where('activo', '==', true).limit(1)
      ).get().toPromise();

      if (snapshot && !snapshot.empty) {
        const data = snapshot.docs[0].data() as any;
        // Retornamos el nombre real guardado por el admin (Ej: "octubre 2025 - febrero 2026")
        return data.nombre;
      } else {
        console.warn('⚠️ No hay ningún periodo activo configurado en la base de datos.');
        return 'Sin Periodo Activo';
      }
    } catch (error) {
      console.error('Error obteniendo periodo activo:', error);
      return 'Error al obtener periodo';
    }
  }

  /**
   * Verifica si un usuario (estudiante) debe ser ascendido a 'docente'.
   * Comprueba si su email existe en la colección `docentes_autorizados` y si el periodo coincide.
   * @param uid UID del usuario
   * @param email Email del usuario
   */
  async verificarAscensoDocente(uid: string, email: string) {
    try {
      if (!email) return;



      const userRef = this.firestore.collection('users').doc(uid);
      const userSnap = await userRef.get().toPromise();

      if (!userSnap?.exists) return;

      const userData = userSnap.data() as UserData;

      // Si ya es docente o admin, no hacemos nada
      if (userData && (userData.role === 'docente' || userData.isAdmin)) {

        return;
      }

      // Si es estudiante, buscar en lista blanca
      if (userData && userData.role === 'estudiante') {
        const docenteRef = this.firestore.collection('docentes_autorizados').doc(email);
        const docenteSnap = await docenteRef.get().toPromise();

        if (docenteSnap?.exists) {
          const datosDocente = docenteSnap.data() as any;

          const periodoActual = (await this.obtenerPeriodoActivo()).toLowerCase().trim();
          const periodoDocente = (datosDocente.periodo_academico || '').toLowerCase().trim();



          if (periodoDocente.includes(periodoActual) || periodoActual.includes(periodoDocente)) {
            await userRef.update({
              role: 'docente',
              isActive: true
            });

          } else {
            console.warn('⚠️ [Auth] El usuario está en la lista, pero los periodos NO coinciden.');
          }
        } else {
          console.warn(`❌ [Auth] Correo no encontrado en la colección 'docentes_autorizados'.`);
        }
      }
    } catch (error) {
      console.error('Error verificando rol:', error);
    }
  }

  /**
   * Procesa el login o registro del usuario.
   * - Crea el usuario en la colección `users` si no existe.
   * - Elimina duplicados si existen.
   * - Llama a verificación de ascenso a docente.
   */
  async procesarUsuarioLogin(email: string, nombre: string, authUid: string): Promise<string> {
    const usersRef = this.firestore.collection('users');

    const query = await usersRef.ref.where('email', '==', email).get();

    let finalUid = authUid;

    if (!query.empty) {
      // EL USUARIO YA EXISTE
      const docExistente = query.docs[0];
      finalUid = docExistente.id;

      // Borrar duplicados si existen
      if (query.docs.length > 1) {
        for (let i = 1; i < query.docs.length; i++) {
          await usersRef.doc(query.docs[i].id).delete();
        }
      }

    } else {
      // EL USUARIO ES NUEVO
      await usersRef.doc(authUid).set({
        email: email,
        name: nombre,
        role: 'estudiante',
        isActive: true,
        isAdmin: false,
        createdAt: new Date()
        // Sin authProvider
      });
    }

    // Verificamos rol inmediatamente
    await this.verificarAscensoDocente(finalUid, email);

    return finalUid;
  }

  /**
   * Inicia sesión con Microsoft (Azure AD) usando un popup.
   * Si el login es exitoso, procesa el usuario y guarda la sesión.
   */
  login() {
    const loginRequest = {
      scopes: ["User.Read", "openid", "profile"]
    };

    this.msalService.loginPopup(loginRequest)
      .subscribe({
        next: async (response) => {
          if (response.account && response.account.username) {
            const uidFinal = await this.procesarUsuarioLogin(
              response.account.username.toLowerCase(),
              response.account.name || 'Usuario Microsoft',
              response.uniqueId
            );
            await this.setUserSession('azure', uidFinal);
          }
          this.router.navigate(['/principal']);
        },
        error: (error) => {
          console.error('Login failed', error);
        }
      });
  }

  /**
   * Inicia sesión con correo y contraseña usando Firebase Auth.
   * @param email Correo electrónico
   * @param password Contraseña
   */
  async loginWithFirebase(email: string, password: string): Promise<any> {
    try {
      const result = await this.afAuth.signInWithEmailAndPassword(email, password);
      if (result.user && result.user.email) {

        const uidFinal = await this.procesarUsuarioLogin(
          result.user.email,
          result.user.displayName || 'Usuario',
          result.user.uid
        );

        await this.setUserSession('firebase', uidFinal);
        return result;
      }
    } catch (error) {
      throw error;
    }
  }

  async registerWithFirebase(email: string, password: string): Promise<any> {
    try {
      const result = await this.afAuth.createUserWithEmailAndPassword(email, password);
      if (result.user && result.user.email) {

        const uidFinal = await this.procesarUsuarioLogin(
          result.user.email,
          result.user.email.split('@')[0],
          result.user.uid
        );

        await this.setUserSession('firebase', uidFinal);
        return result;
      }
    } catch (error) {
      throw error;
    }
  }

  // Azure Observable
  loginWithAzure(): Observable<AuthenticationResult> {
    const loginRequest = { scopes: ['user.read'] };

    return from(this.msalService.loginPopup(loginRequest)).pipe(
      tap(async (response: AuthenticationResult) => {
        if (response.account && response.account.username) {
          const uidFinal = await this.procesarUsuarioLogin(
            response.account.username.toLowerCase(),
            response.account.name || 'Usuario Microsoft',
            response.uniqueId
          );
          this.setUserSession('azure', uidFinal);
        }
      }),
      catchError(error => {
        console.error('Azure login error:', error);
        throw error;
      })
    );
  }

  /**
   * Establece las variables de sesión en sessionStorage.
   * @param provider 'firebase' o 'azure'
   * @param userId UID del usuario
   */
  async setUserSession(provider: 'firebase' | 'azure', userId: string): Promise<void> {
    sessionStorage.setItem('sessionToken', 'active');
    sessionStorage.setItem('authProvider', provider);
    sessionStorage.setItem('userId', userId);
  }

  logout(): Promise<void> {
    const provider = sessionStorage.getItem('authProvider');

    sessionStorage.clear();

    if (provider === 'azure') {
      return this.msalService.logout().toPromise();
    } else {
      return this.afAuth.signOut();
    }
  }

  isAuthenticated(): boolean {
    return sessionStorage.getItem('sessionToken') === 'active';
  }

  getCurrentUser(): Observable<any> {
    const provider = sessionStorage.getItem('authProvider');
    const userId = sessionStorage.getItem('userId');

    if (!provider || !userId) {
      return of(null);
    }

    if (provider === 'azure') {
      return of(this.msalService.instance.getActiveAccount()).pipe(
        map(account => account || null)
      );
    } else {
      return this.afAuth.authState;
    }
  }

  listenToPeriodoActivo(): Observable<string> {
    return this.firestore.collection('periodoAcademico', ref =>
      ref.where('activo', '==', true).limit(1)
    ).valueChanges().pipe(
      map((periodos: any[]) => {
        if (periodos && periodos.length > 0) {
          return periodos[0].nombre;
        } else {
          return 'Sin Periodo Activo';
        }
      })
    );
  }


}