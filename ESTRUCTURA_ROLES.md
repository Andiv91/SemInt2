# Sistema de Roles y Permisos - CSECV

## Roles Definidos

### 1. Usuario Básico (user)
**Permisos:**
- Crear cuenta / Iniciar sesión
- Ver temas (módulos)
- Realizar quizzes
- Ver noticias
- **Recibir notificaciones** cuando:
  - Entra a un tema específico
  - Se agregan nuevas noticias a temas que sigues
  - Se publican nuevos cursos relacionados a sus temas de interés

### 2. Administrador (admin)
**Permisos completos:**
- ✅ Crear temas
- ✅ Modificar temas existentes
- ✅ Eliminar temas
- ✅ Agregar items a temas (archivos, descripciones, explicaciones, enlaces, noticias, cursos)
- ✅ Agregar noticias
- ✅ Agregar cursos
- ✅ Gestionar todo el contenido de la plataforma

### 3. Editor de Temas (theme_editor)
**Permisos:**
- ✅ Crear nuevos temas
- ✅ Editar temas existentes
- ✅ Borrar temas
- ✅ Agregar descripción, logo, temática, explicación de temas
- ❌ NO puede agregar noticias
- ❌ NO puede agregar cursos

### 4. Editor de Noticias (news_editor)
**Permisos:**
- ✅ Agregar noticias a temas existentes
- ✅ Editar noticias que agregó
- ❌ NO puede eliminar noticias
- ❌ NO puede crear/modificar/eliminar temas

### 5. Editor de Cursos (course_editor)
**Permisos:**
- ✅ Agregar cursos a temas existentes
- ✅ Editar cursos que agregó
- ❌ NO puede eliminar cursos
- ❌ NO puede crear/modificar/eliminar temas

## Estructura de Base de Datos Propuesta

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "username": "Usuario",
      "passwordHash": "hash",
      "salt": "salt",
      "role": "user",
      "notifications": {
        "enabled": true,
        "topics": ["seguridad-fisica", "phishing"],
        "settings": {
          "news": true,
          "courses": true,
          "updates": true
        }
      }
    }
  ],
  "topics": [
    {
      "id": "uuid",
      "slug": "seguridad-fisica",
      "title": "Seguridad Física",
      "description": "Descripción del tema",
      "logo": "url_al_logo",
      "videoUrl": "youtube_id",
      "createdBy": "user_id",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ],
  "news": [
    {
      "id": "uuid",
      "topicId": "topic_uuid",
      "title": "Título de la noticia",
      "url": "https://...",
      "description": "Descripción",
      "addedBy": "user_id",
      "addedAt": "timestamp"
    }
  ],
  "courses": [
    {
      "id": "uuid",
      "topicId": "topic_uuid",
      "title": "Título del curso",
      "url": "https://...",
      "description": "Descripción",
      "addedBy": "user_id",
      "addedAt": "timestamp"
    }
  ]
}
```

## Middlewares de Permisos

```javascript
// Verificar si tiene un rol específico o superior
function hasRole(requiredRole) {
  const roleHierarchy = {
    'user': 0,
    'course_editor': 1,
    'news_editor': 2,
    'theme_editor': 3,
    'admin': 4
  };
  
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    
    const userRole = roleHierarchy[req.user.role] || 0;
    const required = roleHierarchy[requiredRole] || 0;
    
    if (userRole < required) {
      return res.status(403).json({ error: 'insufficient_permissions' });
    }
    
    next();
  };
}
```

## APIs a Implementar

### Temas (Topics)
- `GET /api/topics` - Listar temas (público)
- `GET /api/topics/:id` - Obtener tema específico
- `POST /api/topics` - Crear tema (admin, theme_editor)
- `PUT /api/topics/:id` - Actualizar tema (admin, theme_editor)
- `DELETE /api/topics/:id` - Eliminar tema (admin, theme_editor)

### Noticias
- `GET /api/topics/:id/news` - Noticias de un tema
- `POST /api/topics/:id/news` - Agregar noticia (admin, news_editor)
- `PUT /api/news/:id` - Editar noticia (admin, news_editor que la creó)
- `DELETE /api/news/:id` - Eliminar (solo admin)

### Cursos
- `GET /api/topics/:id/courses` - Cursos de un tema
- `POST /api/topics/:id/courses` - Agregar curso (admin, course_editor)
- `PUT /api/courses/:id` - Editar curso (admin, course_editor que lo creó)
- `DELETE /api/courses/:id` - Eliminar (solo admin)

### Notificaciones
- `GET /api/notifications` - Notificaciones del usuario
- `POST /api/notifications/subscribe` - Suscribirse a tema
- `POST /api/notifications/unsubscribe` - Desuscribirse

