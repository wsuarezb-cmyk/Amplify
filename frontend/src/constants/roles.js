/**
 * Roles de usuario de Pitch y utilidades de comparación.
 * Jerarquía confirmada: VIEWER < AUDITOR < LIDER_QUALITY < ADMIN.
 * Debe mantenerse sincronizada con _ROLE_ORDER en backend/dependencies.py.
 */

export const ROLES = {
  VIEWER:        'VIEWER',
  OPERATOR:      'OPERATOR',
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
  [ROLES.OPERATOR]:      0,
  [ROLES.AUDITOR]:       1,
  [ROLES.LIDER_QUALITY]: 2,
  [ROLES.ADMIN]:         3,
};

/**
 * Devuelve true si userRole tiene al menos el nivel de minRole.
 */
export const hasMinRole = (userRole, minRole) =>
  (ROLE_ORDER[userRole] ?? -1) >= (ROLE_ORDER[minRole] ?? 0);

const VIEWER_TRACE_MODULES = ['sends', 'looker'];

export const canAccessAppModule = (role, module) =>
  role === ROLES.ADMIN
  || ((role === ROLES.OPERATOR || role === ROLES.VIEWER) && module === 'trace');

export const canAccessTraceModule = (role, module) =>
  role === ROLES.ADMIN || role === ROLES.OPERATOR
  || (role === ROLES.VIEWER && VIEWER_TRACE_MODULES.includes(module));

export const defaultTraceModule = role => role === ROLES.VIEWER ? 'sends' : 'audiences';

export const defaultAppRoute = role =>
  role === ROLES.VIEWER || role === ROLES.OPERATOR ? '/trace' : '/reporteria';
