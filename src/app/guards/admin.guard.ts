import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { map, switchMap, take, catchError } from 'rxjs/operators';
import { UserData } from '../services/auth.service';

@Injectable({
    providedIn: 'root'
})
/**
 * Guard para proteger rutas de administración.
 * Verifica si el usuario autenticado tiene el campo 'isAdmin' en true o el rol 'administrador'.
 */
export class AdminGuard implements CanActivate {

    constructor(
        private afAuth: AngularFireAuth,
        private firestore: AngularFirestore,
        private router: Router
    ) { }

    canActivate(): Observable<boolean | UrlTree> {
        return this.afAuth.authState.pipe(
            take(1),
            switchMap(user => {
                if (!user) {
                    this.router.navigate(['/login']);
                    return of(false);
                }

                return this.firestore.collection('users').doc<UserData>(user.uid).get().pipe(
                    take(1),
                    map(snapshot => {
                        if (!snapshot.exists) {
                            this.router.navigate(['/login']);
                            return false;
                        }
                        const userData = snapshot.data() as UserData;

                        if (userData.isAdmin === true || userData.role === 'administrador') {
                            return true;
                        } else {
                            // Si no es admin, redirigir a principal
                            this.router.navigate(['/principal']);
                            return false;
                        }
                    })
                );
            }),
            catchError(() => {
                this.router.navigate(['/login']);
                return of(false);
            })
        );
    }
}
