-- Seed Roles
INSERT INTO roles (name, description, is_system) VALUES
('Administrador', 'Acceso total al sistema', TRUE),
('Operador', 'Usuario operativo con permisos de escaneo y carga', TRUE),
('Supervisor', 'Supervisor con capacidades de revisión y reportes', TRUE),
('Consultor', 'Usuario solo lectura', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Seed Permissions
INSERT INTO permissions (code, name, module, description) VALUES
('users.view', 'Ver usuarios', 'users', 'Ver listado de usuarios'),
('users.create', 'Crear usuarios', 'users', 'Crear nuevos usuarios'),
('users.edit', 'Editar usuarios', 'users', 'Editar usuarios existentes'),
('users.delete', 'Eliminar usuarios', 'users', 'Eliminar usuarios del sistema'),
('roles.view', 'Ver roles', 'roles', 'Ver listado de roles'),
('roles.create', 'Crear roles', 'roles', 'Crear nuevos roles'),
('roles.edit', 'Editar roles', 'roles', 'Editar roles existentes'),
('roles.delete', 'Eliminar roles', 'roles', 'Eliminar roles del sistema'),
('folders.view', 'Ver carpetas', 'folders', 'Ver estructura de carpetas'),
('folders.create', 'Crear carpetas', 'folders', 'Crear nuevas carpetas'),
('folders.edit', 'Editar carpetas', 'folders', 'Editar carpetas existentes'),
('folders.delete', 'Eliminar carpetas', 'folders', 'Eliminar carpetas'),
('documents.view', 'Ver documentos', 'documents', 'Visualizar documentos'),
('documents.create', 'Crear documentos', 'documents', 'Subir o crear documentos'),
('documents.edit', 'Editar documentos', 'documents', 'Editar metadatos de documentos'),
('documents.delete', 'Eliminar documentos', 'documents', 'Eliminar documentos'),
('documents.download', 'Descargar documentos', 'documents', 'Descargar documentos'),
('scan.execute', 'Ejecutar escaneo', 'scan', 'Realizar escaneos desde escáner'),
('scan.view', 'Ver escáneres', 'scan', 'Ver dispositivos de escaneo'),
('ocr.execute', 'Ejecutar OCR', 'ocr', 'Ejecutar OCR sobre documentos'),
('ocr.view', 'Ver OCR', 'ocr', 'Ver resultados de OCR'),
('search.execute', 'Buscar documentos', 'search', 'Ejecutar búsquedas'),
('reports.view', 'Ver reportes', 'reports', 'Ver reportes del sistema'),
('reports.export', 'Exportar reportes', 'reports', 'Exportar reportes'),
('audit.view', 'Ver auditoría', 'audit', 'Ver registros de auditoría'),
('config.view', 'Ver configuración', 'config', 'Ver configuración del sistema'),
('config.edit', 'Editar configuración', 'config', 'Editar configuración del sistema')
ON CONFLICT (code) DO NOTHING;

-- Assign all permissions to Administrator role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Administrador'
ON CONFLICT DO NOTHING;

-- Assign operator permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Operador'
AND p.code IN ('documents.view', 'documents.create', 'documents.edit', 'documents.download',
               'folders.view', 'scan.execute', 'scan.view', 'ocr.execute', 'ocr.view',
               'search.execute')
ON CONFLICT DO NOTHING;

-- Assign supervisor permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Supervisor'
AND p.code IN ('documents.view', 'documents.create', 'documents.edit', 'documents.download',
               'folders.view', 'folders.create', 'scan.execute', 'scan.view',
               'ocr.execute', 'ocr.view', 'search.execute',
               'reports.view', 'reports.export', 'audit.view')
ON CONFLICT DO NOTHING;

-- Assign consultant permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Consultor'
AND p.code IN ('documents.view', 'documents.download', 'folders.view', 'ocr.view', 'search.execute')
ON CONFLICT DO NOTHING;

-- Seed Document Types
INSERT INTO document_types (code, name, description, requires_ocr) VALUES
('CI', 'Cédula de Identidad', 'Documento de identificación personal', TRUE),
('NIT', 'NIT', 'Número de Identificación Tributaria', TRUE),
('CONTRATO', 'Contrato', 'Documento contractual', TRUE),
('FACTURA', 'Factura', 'Factura o comprobante de pago', TRUE),
('SOLICITUD', 'Solicitud', 'Solicitud formal', TRUE),
('FORMULARIO', 'Formulario', 'Formulario diligenciado', TRUE),
('CARTA', 'Carta', 'Carta formal', TRUE),
('MEMORANDUM', 'Memorándum', 'Memorándum interno', TRUE),
('OTRO', 'Otro', 'Otro tipo de documento', FALSE)
ON CONFLICT (code) DO NOTHING;

-- Seed default admin user (password: admin123)
INSERT INTO users (username, email, password_hash, full_name, is_superuser, is_active)
VALUES ('admin', 'admin@odespro.com', '$2b$12$jSMkWhJ4NE7bMDpRCMHwcess9bw4UzipEJanIJu8COLpnvpYTVP5K', 'Administrador del Sistema', TRUE, TRUE)
ON CONFLICT (username) DO NOTHING;

-- Assign admin role to admin user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'admin' AND r.name = 'Administrador'
ON CONFLICT DO NOTHING;

-- Seed storage locations
INSERT INTO storage_locations (name, provider, bucket_name, endpoint, is_default) VALUES
('MinIO Principal', 'minio', 'documents', 'minio:9000', TRUE),
('MinIO Imágenes', 'minio', 'images', 'minio:9000', FALSE),
('MinIO Thumbnails', 'minio', 'thumbnails', 'minio:9000', FALSE),
('MinIO OCR', 'minio', 'ocr', 'minio:9000', FALSE),
('MinIO Exports', 'minio', 'exports', 'minio:9000', FALSE)
ON CONFLICT DO NOTHING;
