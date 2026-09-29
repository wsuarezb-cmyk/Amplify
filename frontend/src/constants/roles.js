/**
 * Roles de usuario de Pitch y utilidades de comparación.
 * Jerarquía confirmada: VIEWER < AUDITOR < LIDER_QUALITY < ADMIN.
 * Debe mantenerse sincronizada con _ROLE_ORDER en backend/dependencies.py.
 */

export const ROLES = {
  VIEWER:        'VIEWER',
  AUDITOR:       'AUDITOR',
  LIDER_QUALITY: 'LIDER_QUALITY',
  ADMIN:         'ADMIN',
};

/**
 * Orden jerárquico: índice mayor = más permisos.
 * Usar para comparaciones tipo "¿tiene al menos rol X?".
 */
export const ROLE_ORDER = {
  [ROLES.VIEWER]:        0,
  [ROLES.AUDITOR]:       1,
  [ROLES.LIDER_QUALITY]: 2,
  [ROLES.ADMIN]:         3,
};

/**
 * Devuelve true si userRole tiene al menos el nivel de minRole.
 */
export const hasMinRole = (userRole, minRole) =>
  (ROLE_ORDER[userRole] ?? -1) >= (ROLE_ORDER[minRole] ?? 0);
