import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-alert-modal',
  templateUrl: './alert-modal.component.html',
  styleUrls: ['./alert-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertModalComponent {
  /** Mensaje que se mostrará en el modal */
  @Input() message: string = '';
  /** Controla si el modal es visible */
  @Input() visible: boolean = false;
  /** Modo confirmación: muestra botones Sí/No en lugar de Ok */
  @Input() isConfirm: boolean = false;
  /** Emite cuando el usuario cierra el modal (Ok o No) */
  @Output() closeModal = new EventEmitter<void>();
  /** Emite cuando el usuario confirma (Sí) en modo confirmación */
  @Output() confirm = new EventEmitter<void>();

  /** Cierra el modal al presionar Ok o No */
  onClose(): void {
    this.closeModal.emit();
  }

  /** Confirma la acción al presionar Sí */
  onConfirm(): void {
    this.confirm.emit();
  }
}
