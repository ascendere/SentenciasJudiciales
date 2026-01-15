import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable, of } from 'rxjs';
import { map, switchMap, take, catchError } from 'rxjs/operators';
import { UserData } from '../services/auth.service';

@Injectable({
    providedIn: 'root'
})
/**
 * Guard que controla el acceso a una sentencia específica.
 * Permite acceso si:
 * 1. Es Administrador.
 * 2. Es Estudiante y dueño de la sentencia (email_estudiante).
 * 3. Es Docente asignado a la sentencia (email_docente).
 */
export class SentenceOwnerGuard implements CanActivate {

    constructor(
        private firestore: AngularFirestore,
        private router: Router
    ) { }

    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Observable<boolean> {

        const userId = sessionStorage.getItem('userId');
        const docId = route.queryParams['id'];
        const numeroProceso = route.queryParams['numero_proceso'];

        if (!userId) {
            this.router.navigate(['/login']);
            return of(false);
        }

        if (!docId && !numeroProceso) {
            this.router.navigate(['/principal']);
            return of(false);
        }

        return this.firestore.collection('users').doc<UserData>(userId).get().pipe(
            take(1),
            switchMap(userSnap => {
                if (!userSnap.exists) {
                    this.router.navigate(['/login']);
                    return of(false);
                }

                const user = userSnap.data() as UserData;
                const userEmail = (user.email || '').toLowerCase().trim();

                if (user.isAdmin === true || user.role === 'administrador') {
                    return of(true);
                }

                let sentenciaQuery$: Observable<any>;

                if (docId) {
                    sentenciaQuery$ = this.firestore.collection('sentencias').doc(docId).get().pipe(
                        map(doc => doc.exists ? doc.data() : null)
                    );
                } else {

                    let queryRef = (ref: any) => {
                        let query = ref.where('numero_proceso', '==', numeroProceso);

                        if (user.role === 'estudiante') {
                            // Estudiantes solo pueden ver sus propias sentencias
                            query = query.where('email_estudiante', '==', userEmail);
                        } else if (user.role === 'docente') {
                            // Docentes solo pueden ver sentencias asignadas a ellos
                            query = query.where('email_docente', '==', userEmail);
                        }

                        return query.limit(1);
                    };

                    sentenciaQuery$ = this.firestore.collection('sentencias', queryRef).valueChanges().pipe(
                        map(docs => docs.length > 0 ? docs[0] : null)
                    );
                }

                return sentenciaQuery$.pipe(
                    take(1),
                    map((sentencia: any) => {
                        if (!sentencia) {
                            console.warn('⛔ Sentencia no encontrada o acceso denegado por reglas.');
                            this.router.navigate(['/principal'], { queryParams: { error: 'access_denied' } });
                            return false;
                        }
                        return true;
                    })
                );
            }),
            catchError(err => {
                console.error('Error in Guard', err);
                this.router.navigate(['/principal'], { queryParams: { error: 'access_denied' } });
                return of(false);
            })
        );
    }
}