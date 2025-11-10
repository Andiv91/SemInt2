/* Seed database with current topics and content */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function upsertTopic(slug, title, description, imagePath, video, news, courses, quiz) {
  const topic = await prisma.topic.upsert({
    where: { slug },
    create: {
      slug, title, description, imagePath,
      videos: { create: [ video ] },
      news: { create: news },
      courses: { create: courses },
      questions: { create: quiz.map(q => ({ text: q.text, options: { create: q.options } })) }
    },
    update: {
      title, description, imagePath,
      videos: { deleteMany: {}, create: [ video ] },
      news: { deleteMany: {}, create: news },
      courses: { deleteMany: {}, create: courses },
      questions: { deleteMany: {}, create: quiz.map(q => ({ text: q.text, options: { create: q.options } })) }
    }
  });
  return topic;
}

async function main(){
  // Seguridad física
  await upsertTopic(
    'seguridad-fisica',
    'Seguridad Física',
    'Controla accesos, protege dispositivos y evita manipulaciones no autorizadas.',
    'images/seguridadfisica.png',
    { title: 'Seguridad física', url: 'https://www.youtube.com/watch?v=FGNGRvKr6oE', provider: 'youtube', order: 1 },
    [
      { title: 'La puerta principal, nueva frontera', url: 'https://federalnewsnetwork.com/cybersecurity/2025/09/the-front-door-is-the-new-frontline-of-physical-security/', source: 'federalnewsnetwork.com', summary: 'Acceso físico como punto crítico.' },
      { title: 'Mercado de seguridad física en alza', url: 'https://industrytoday.co.uk/aerospace/physical-security-market-set-to-usd-989b-in-2025-to-usd-140b-by-2035', source: 'industrytoday.co.uk', summary: 'Crecimiento hasta 2035.' },
      { title: 'ASSA ABLOY adquiere SiteOwl', url: 'https://www.securityinfowatch.com/industry-news/press-release/55310521/assa-abloy-assa-abloy-to-acquire-physical-security-management-platform-siteowl', source: 'securityinfowatch.com', summary: 'Gestión de seguridad física.' },
      { title: 'Convergencia física y ciber', url: 'https://www.infosecurity-magazine.com/physical-and-information-security-convergence/', source: 'infosecurity-magazine.com', summary: 'Integración de dominios.' },
      { title: 'IA en seguridad física', url: 'https://fedtechmagazine.com/article/2025/08/ai-powered-physical-security-perfcon', source: 'fedtechmagazine.com', summary: 'Beneficios en agencias.' }
    ],
    [
      { title: 'End User Physical Security', url: 'https://app.cybrary.it/end-user-physical-security', provider: 'cybrary.it', summary: 'Buenas prácticas para usuarios.' },
      { title: 'Convergencia físico‑ciber (ASIS)', url: 'https://store.asisonline.org/essentials-of-convergence-bridging-the-gap-between-physical-security-and-cybersecurity-certificate-program.html', provider: 'ASIS', summary: 'Esenciales de convergencia.' },
      { title: 'Physical Security (CDSE)', url: 'https://www.cdse.edu/Training/Physical-Security/', provider: 'CDSE', summary: 'Formación DoD.' },
      { title: 'Virginia Tech PCSEC', url: 'https://cpe.vt.edu/pcsec.html', provider: 'VT', summary: 'Programa combinado.' },
      { title: 'InfosecTrain Physical Security', url: 'https://www.infosectrain.com/physical-security-training-courses/', provider: 'InfosecTrain', summary: 'Cursos especializados.' }
    ],
    [
      { text: '¿Qué control evita accesos no autorizados?', options: [{ text:'Contraseñas compartidas' }, { text:'Badges personales', correct:true }, { text:'Post-it con claves' }] },
      { text: '¿Qué ayuda a evidenciar manipulaciones?', options: [{ text:'Cintas o sellos', correct:true }, { text:'Pegatinas' }, { text:'Iluminación' }] }
    ]
  );

  // Servicios externos
  await upsertTopic(
    'servicios-externos',
    'Servicios Externos',
    'Evalúa a proveedores, contratos y accesos. Minimiza riesgos de terceros.',
    'images/serviciosexternos.jpg',
    { title: 'Terceros y proveedores', url: 'https://www.youtube.com/watch?v=lCmazsF3LDg', provider: 'youtube', order: 1 },
    [
      { title: 'Air France/KLM filtración por plataforma externa', url: 'https://www.cm-alliance.com/cybersecurity-blog/air-france-klm-data-breach', source: 'cm-alliance.com', summary: 'Acceso no autorizado afectó datos.' },
      { title: 'Microsoft: programa gratuito a gobiernos UE', url: 'https://timesofindia.indiatimes.com/world/europe/microsoft-offers-free-cybersecurity-programme-to-european-governments/articleshow/113062890.cms', source: 'timesofindia', summary: 'Refuerzo defensivo con IA.' },
      { title: 'Oracle: extorsión ligada a parches', url: 'https://therecord.media/oracle-extortion-campaign-linked-to-july-patches', source: 'therecord.media', summary: 'Campaña de extorsión a clientes.' },
      { title: 'Collins Aerospace check‑in afectado', url: 'https://en.wikipedia.org/wiki/Collins_Aerospace', source: 'Wikipedia', summary: 'Interrupciones en vMUSE.' },
      { title: 'Victoria’s Secret incidente en web', url: 'https://apnews.com/article/victorias-secret-website-down-us-incident-2025', source: 'AP News', summary: 'Desactivación temporal.' }
    ],
    [
      { title: 'CISA Training & Exercises', url: 'https://www.cisa.gov/cybersecurity-training-exercises', provider: 'CISA', summary: 'Formación gratuita y ejercicios.' },
      { title: 'SANS Courses', url: 'https://www.sans.org/cyber-security-courses', provider: 'SANS', summary: '85+ cursos prácticos.' },
      { title: 'EC‑Council Courses', url: 'https://www.eccouncil.org/', provider: 'EC‑Council', summary: 'Certificaciones.' },
      { title: 'Wizer: Awareness & Phishing', url: 'https://www.wizer-training.com/', provider: 'Wizer', summary: 'Concientización con simulaciones.' },
      { title: 'Fortinet: Advanced Training', url: 'https://www.fortinet.com/training/cybersecurity-professionals', provider: 'Fortinet', summary: 'Ruta avanzada auto-ritmo.' }
    ],
    [
      { text: '¿Qué contrato define tiempos de respuesta?', options: [{ text:'NDA' }, { text:'SLA', correct:true }, { text:'DPA' }] }
    ]
  );

  // Links y archivos
  await upsertTopic(
    'links-y-archivos',
    'Links y Archivos',
    'Verifica remitentes y URLs; escanea adjuntos y usa HTTPS.',
    'images/linksyarchivos.jpg',
    { title: 'Links y adjuntos seguros', url: 'https://www.youtube.com/watch?v=TlB-vGW-xLQ', provider: 'youtube', order: 1 },
    [
      { title: 'Windows bloquea previews riesgosos', url: 'https://www.helpnetsecurity.com/2025/10/15/windows-file-explorer-blocks-risky-previews/', source: 'Help Net Security', summary: 'Mejora de seguridad.' },
      { title: 'PhishLumos: mitigación proactiva', url: 'https://arxiv.org/abs/2509.12345', source: 'arXiv', summary: 'Sistema multiagente.' },
      { title: 'Trivial Trojans via MCP', url: 'https://arxiv.org/abs/2507.01234', source: 'arXiv', summary: 'Exfiltración con MCP.' },
      { title: 'Remcos RAT por LNK/MSHTA', url: 'https://thehackernews.com/2025/09/remcos-rat-delivered-via-lnk-and-mshta.html', source: 'The Hacker News', summary: 'Campaña basada en PowerShell.' },
      { title: 'Patchwork usa LNK maliciosos', url: 'https://thehackernews.com/2025/08/patchwork-uses-malicious-lnk-files.html', source: 'The Hacker News', summary: 'Spear‑phishing a defensa.' }
    ],
    [
      { title: 'Cisco: Introduction to Cybersecurity', url: 'https://www.netacad.com/courses/cybersecurity/introduction-cybersecurity', provider: 'Cisco NetAcad', summary: 'Bases para protegerte.' },
      { title: 'NAVEX: Cybersecurity Basics', url: 'https://www.navex.com/en-us/courses/cybersecurity-training/', provider: 'NAVEX', summary: 'Buenas prácticas.' },
      { title: 'Intertek: Awareness Training', url: 'https://www.intertek.com/cybersecurity/training/', provider: 'Intertek', summary: 'Conciencia en ciber.' },
      { title: 'QuestCE: Security Awareness', url: 'https://learn.questce.com/online-training/cybersecurity-security-awareness', provider: 'QuestCE', summary: 'Refuerza protocolos.' },
      { title: 'HHS: Awareness Training', url: 'https://www.hhs.gov/ocio/cybersecurity/awareness-training/index.html', provider: 'HHS', summary: 'Temas de phishing y fundamentos.' }
    ],
    [
      { text: '¿Qué revisar en una URL?', options: [{ text:'Color del botón' }, { text:'Dominio y HTTPS', correct:true }, { text:'Tamaño de fuente' }] }
    ]
  );

  // General
  await upsertTopic(
    'general',
    'General',
    'Buenas prácticas: contraseñas fuertes, MFA, bloquea tu equipo, actualiza software.',
    'images/general.jpg',
    { title: 'Buenas prácticas', url: 'https://www.youtube.com/watch?v=2ZZQlgV2Gus', provider: 'youtube', order: 1 },
    [],
    [],
    []
  );

  // Servidores
  await upsertTopic(
    'servidores',
    'Servidores',
    'Actualiza, aplica mínimos privilegios y monitorea recursos.',
    'images/servidores.jpg',
    { title: 'Qué es un servidor', url: 'https://www.youtube.com/watch?v=UjCDWCeHCzY', provider: 'youtube', order: 1 },
    [],
    [],
    []
  );

  // Phishing
  await upsertTopic(
    'phishing',
    'Phishing',
    'Identifica correos, enlaces y adjuntos maliciosos y evita entregar credenciales.',
    'images/phishing.png',
    { title: 'Phishing', url: 'https://www.youtube.com/watch?v=UuuAlP7ay6U', provider: 'youtube', order: 1 },
    [],
    [],
    []
  );
}

module.exports = { run: main };

if (require.main === module){
  main().then(()=>prisma.$disconnect()).catch(async (e)=>{ console.error(e); await prisma.$disconnect(); process.exit(1); });
}
