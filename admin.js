// Panel de Administración CSECV

let currentUser = null;
let allTopics = [];

// ===== INIT =====
(async function() {
  await checkAuthAndRole();
  if (!currentUser || !['admin', 'theme_editor', 'news_editor', 'course_editor'].includes(currentUser.role)) {
    alert('No tienes permisos para acceder a esta página');
    window.location.href = '/temas';
    return;
  }
  
  loadUserInfo();
  setupTabs();
  loadTopics();
  setupForms();
})();

// ===== AUTH =====
async function checkAuthAndRole() {
  try {
    const res = await fetch('/api/me');
    const user = await res.json();
    if (!user.authenticated) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = user;
  } catch (error) {
    console.error('Error de autenticación:', error);
    window.location.href = '/login.html';
  }
}

function loadUserInfo() {
  const info = document.getElementById('currentUserInfo');
  if (info) {
    info.innerHTML = `<p><strong>${currentUser.username}</strong> (${currentUser.role})</p>`;
  }
  
  // Logout button
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/temas';
    });
  }
  
  // User button
  const btnUser = document.getElementById('btn-user');
  if (btnUser) {
    btnUser.textContent = currentUser.username || currentUser.email;
  }
}

// ===== TABS =====
function setupTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const content = document.querySelectorAll('.admin-content');
      content.forEach(c => c.classList.remove('active'));
      
      const target = document.getElementById(`content-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
      
      if (tab.dataset.tab === 'topics') loadTopics();
      else if (tab.dataset.tab === 'news') loadNews();
      else if (tab.dataset.tab === 'courses') loadCourses();
    });
  });
}

// ===== TOPICS =====
async function loadTopics() {
  try {
    const res = await fetch('/api/topics');
    allTopics = await res.json();
    const list = document.getElementById('list-topics');
    
    if (!list) return;
    
    if (allTopics.length === 0) {
      list.innerHTML = '<p class="center">No hay temas aún.</p>';
      return;
    }
    
    const canEdit = ['admin', 'theme_editor'].includes(currentUser.role);
    
    list.innerHTML = allTopics.map(topic => `
      <div class="admin-item">
        <div class="admin-item-content">
          <h4>${topic.logo || ''} ${topic.title}</h4>
          <p style="color: var(--muted); margin: 8px 0;">${topic.description || ''}</p>
          <p style="font-size: 13px; color: var(--muted);">Slug: <code>${topic.slug}</code></p>
        </div>
        <div class="admin-item-actions">
          ${canEdit ? `<button class="btn btn-ghost btn-small" onclick="editTopic('${topic.id}')">Editar</button>` : ''}
          ${currentUser.role === 'admin' ? `<button class="btn btn-ghost btn-small" onclick="deleteTopic('${topic.id}')" style="color: #ff6b6b;">Eliminar</button>` : ''}
        </div>
      </div>
    `).join('');
    
    updateTopicSelects();
  } catch (error) {
    console.error('Error cargando temas:', error);
  }
}

async function createTopic(e) {
  e.preventDefault();
  const errorEl = document.getElementById('error-topics');
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  
  try {
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (res.ok) {
      errorEl.textContent = '';
      form.reset();
      alert('Tema creado exitosamente');
      loadTopics();
    } else {
      errorEl.textContent = result.error || 'Error al crear tema';
    }
  } catch (error) {
    errorEl.textContent = 'Error de conexión';
  }
}

function editTopic(id) {
  const topic = allTopics.find(t => t.id === id);
  if (!topic) return;
  
  // Por ahora solo alerta, implementar modal de edición si quieres
  alert(`Editar tema: ${topic.title}\n\nFuncionalidad de edición completa en próxima versión.`);
}

async function deleteTopic(id) {
  if (!confirm('¿Estás seguro de eliminar este tema?')) return;
  
  try {
    const res = await fetch(`/api/topics/${id}`, { method: 'DELETE' });
    const result = await res.json();
    
    if (res.ok) {
      alert('Tema eliminado');
      loadTopics();
    } else {
      alert('Error: ' + (result.error || 'desconocido'));
    }
  } catch (error) {
    alert('Error de conexión');
  }
}

function updateTopicSelects() {
  const selectNews = document.getElementById('select-topic-news');
  const selectCourses = document.getElementById('select-topic-courses');
  
  if (selectNews) {
    selectNews.innerHTML = '<option value="">Seleccionar tema...</option>' + allTopics.map(t => 
      `<option value="${t.id}">${t.title}</option>`
    ).join('');
  }
  
  if (selectCourses) {
    selectCourses.innerHTML = '<option value="">Seleccionar tema...</option>' + allTopics.map(t => 
      `<option value="${t.id}">${t.title}</option>`
    ).join('');
  }
}

// ===== NEWS =====
async function loadNews() {
  try {
    const res = await fetch('/api/topics');
    const topics = await res.json();
    
    // Cargar noticias de todos los temas
    const newsPromises = topics.map(topic => 
      fetch(`/api/topics/${topic.slug}/news`).then(r => r.json().then(news => news.map(n => ({...n, topicName: topic.title}))))
    );
    
    const allNews = (await Promise.all(newsPromises)).flat();
    const list = document.getElementById('list-news');
    
    if (!list) return;
    
    if (allNews.length === 0) {
      list.innerHTML = '<p class="center">No hay noticias aún.</p>';
      return;
    }
    
    list.innerHTML = allNews.map(news => `
      <div class="admin-item">
        <div class="admin-item-content">
          <h4><a href="${news.url}" target="_blank" rel="noopener">${news.title}</a></h4>
          <p style="color: var(--muted); margin: 8px 0;">${news.description || ''}</p>
          <p style="font-size: 13px; color: var(--muted);">Tema: ${news.topicName || 'N/A'}</p>
        </div>
        <div class="admin-item-actions">
          ${currentUser.role === 'admin' ? `<button class="btn btn-ghost btn-small" onclick="deleteNews('${news.id}')" style="color: #ff6b6b;">Eliminar</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error cargando noticias:', error);
  }
}

async function createNews(e) {
  e.preventDefault();
  const errorEl = document.getElementById('error-news');
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const topicId = data.topicId;
  
  if (!topicId) {
    errorEl.textContent = 'Selecciona un tema';
    return;
  }
  
  try {
    const res = await fetch(`/api/topics/${topicId}/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: data.title, url: data.url, description: data.description })
    });
    
    const result = await res.json();
    
    if (res.ok) {
      errorEl.textContent = '';
      form.reset();
      alert('Noticia agregada exitosamente');
      loadNews();
    } else {
      errorEl.textContent = result.error || 'Error al agregar noticia';
    }
  } catch (error) {
    errorEl.textContent = 'Error de conexión';
  }
}

async function deleteNews(id) {
  if (!confirm('¿Estás seguro de eliminar esta noticia?')) return;
  
  try {
    const res = await fetch(`/api/news/${id}`, { method: 'DELETE' });
    const result = await res.json();
    
    if (res.ok) {
      alert('Noticia eliminada');
      loadNews();
    } else {
      alert('Error: ' + (result.error || 'desconocido'));
    }
  } catch (error) {
    alert('Error de conexión');
  }
}

// ===== COURSES =====
async function loadCourses() {
  try {
    const res = await fetch('/api/topics');
    const topics = await res.json();
    
    const coursesPromises = topics.map(topic => 
      fetch(`/api/topics/${topic.slug}/courses`).then(r => r.json().then(courses => courses.map(c => ({...c, topicName: topic.title}))))
    );
    
    const allCourses = (await Promise.all(coursesPromises)).flat();
    const list = document.getElementById('list-courses');
    
    if (!list) return;
    
    if (allCourses.length === 0) {
      list.innerHTML = '<p class="center">No hay cursos aún.</p>';
      return;
    }
    
    list.innerHTML = allCourses.map(course => `
      <div class="admin-item">
        <div class="admin-item-content">
          <h4><a href="${course.url}" target="_blank" rel="noopener">${course.title}</a></h4>
          <p style="color: var(--muted); margin: 8px 0;">${course.description || ''}</p>
          <p style="font-size: 13px; color: var(--muted);">Tema: ${course.topicName || 'N/A'}</p>
        </div>
        <div class="admin-item-actions">
          ${currentUser.role === 'admin' ? `<button class="btn btn-ghost btn-small" onclick="deleteCourse('${course.id}')" style="color: #ff6b6b;">Eliminar</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error cargando cursos:', error);
  }
}

async function createCourse(e) {
  e.preventDefault();
  const errorEl = document.getElementById('error-courses');
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const topicId = data.topicId;
  
  if (!topicId) {
    errorEl.textContent = 'Selecciona un tema';
    return;
  }
  
  try {
    const res = await fetch(`/api/topics/${topicId}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: data.title, url: data.url, description: data.description })
    });
    
    const result = await res.json();
    
    if (res.ok) {
      errorEl.textContent = '';
      form.reset();
      alert('Curso agregado exitosamente');
      loadCourses();
    } else {
      errorEl.textContent = result.error || 'Error al agregar curso';
    }
  } catch (error) {
    errorEl.textContent = 'Error de conexión';
  }
}

async function deleteCourse(id) {
  if (!confirm('¿Estás seguro de eliminar este curso?')) return;
  
  try {
    const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
    const result = await res.json();
    
    if (res.ok) {
      alert('Curso eliminado');
      loadCourses();
    } else {
      alert('Error: ' + (result.error || 'desconocido'));
    }
  } catch (error) {
    alert('Error de conexión');
  }
}

// ===== FORMS =====
function setupForms() {
  const formTopic = document.getElementById('form-new-topic');
  if (formTopic) {
    formTopic.addEventListener('submit', createTopic);
  }
  
  const formNews = document.getElementById('form-new-news');
  if (formNews) {
    formNews.addEventListener('submit', createNews);
  }
  
  const formCourse = document.getElementById('form-new-course');
  if (formCourse) {
    formCourse.addEventListener('submit', createCourse);
  }
}

// Global functions para eventos inline
window.editTopic = editTopic;
window.deleteTopic = deleteTopic;
window.deleteNews = deleteNews;
window.deleteCourse = deleteCourse;

