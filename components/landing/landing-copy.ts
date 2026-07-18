export const LANDING_LOCALES = ['en', 'it', 'es'] as const
export type LandingLocale = (typeof LANDING_LOCALES)[number]

export interface LandingStoryStep {
  id:
    | 'voice'
    | 'gaps'
    | 'suggestions'
    | 'optimized'
    | 'messages'
    | 'route'
    | 'waiting'
    | 'personal'
  image: string
  title: string
  desc: string
  alt: string
  imgMax?: string
}

interface LandingFeature {
  id: 'optimize' | 'language' | 'control' | 'insights' | 'business'
  title: string
  desc: string
}

export interface LandingCopy {
  header: {
    demo: string
    login: string
    started: string
  }
  hero: {
    badge: string
    title: string
    desc: string
    tryFree: string
    tryNoAccount: string
  }
  value: {
    heading: string
    desc: string
    title: string
    detail: string
    storyCta: string
  }
  story: {
    ariaLabel: string
    steps: LandingStoryStep[]
  }
  mobile: {
    badge: string
    title: string
    desc: string
  }
  features: LandingFeature[]
  footer: {
    terms: string
    privacy: string
    contact: string
    credit: string
    disclaimer: string
  }
  demo: {
    button: string
    credentials: string
    error: string
  }
  phone: {
    alt: string
    placeholder: string
    cards: Array<{ title: string; meta: string }>
  }
}

const images = {
  voice: '/landing/voice.png',
  gaps: '/landing/calendar-before.png',
  suggestions: '/landing/optimizer.png',
  optimized: '/landing/calendar-after.png',
  messages: '/landing/messages.png',
  route: '/landing/route.webp',
  waiting: '/landing/waiting-list.webp',
  personal: '/landing/personal-algorithm.webp',
} as const

export const LANDING_COPY: Record<LandingLocale, LandingCopy> = {
  en: {
    header: {
      demo: 'Try the demo',
      login: 'Log in',
      started: 'Get started',
    },
    hero: {
      badge: 'AI scheduling',
      title: "Stop losing your Sunday to next week's schedule",
      desc: 'If your week runs on appointments, you know the pain — nights and weekends spent arranging them by hand. Cadence rebuilds your whole week, the best way possible, in one click.',
      tryFree: 'Try free',
      tryNoAccount: 'Try without an account',
    },
    value: {
      heading: 'Let Cadence build your week for you',
      desc: "Physiotherapists, osteopaths, salons, trainers, freelancers — millions of small businesses and self-employed pros burn nights and weekends shuffling appointments to close the gaps. It's a real, exhausting weekly puzzle. Cadence solves it: talk to it, optimize, done.",
      title: 'Natural language & voice',
      detail: 'Register clients and appointments just by speaking. No forms, no typing — dictate when clients are free and Cadence writes it down.',
      storyCta: 'Try it yourself — no account needed',
    },
    story: {
      ariaLabel: 'How Cadence works',
      steps: [
        {
          id: 'voice',
          image: images.voice,
          title: 'Book by voice',
          desc: 'Add clients and appointments just by talking. Say “Marco on Tuesday at 3pm” and Cadence fills in the rest — perfect for capturing when clients are available.',
          alt: 'Cadence voice booking interface transcribing a new appointment',
        },
        {
          id: 'gaps',
          image: images.gaps,
          title: 'A week full of gaps',
          desc: "This is how most weeks look: appointments scattered with dead time in between — hours you're paying for but not using.",
          alt: 'Cadence calendar before optimization with visible gaps between appointments',
          imgMax: 'max-w-[440px]',
        },
        {
          id: 'suggestions',
          image: images.suggestions,
          title: 'Smart suggestions, your call',
          desc: 'One click and Cadence proposes exactly which appointments to pull earlier to close the gaps. Keep or skip each move — nothing changes until you say so.',
          alt: 'Cadence optimizer preview showing suggested appointment moves',
          imgMax: 'max-w-[300px]',
        },
        {
          id: 'optimized',
          image: images.optimized,
          title: 'A tight, optimized week',
          desc: 'Same appointments, hundreds of minutes of idle time recovered — automatically, and always within the rules you set.',
          alt: 'Cadence calendar after optimization with a compact schedule',
        },
        {
          id: 'messages',
          image: images.messages,
          title: 'Messages ready to send',
          desc: 'For every appointment that moved, Cadence writes a friendly message you can copy and send to the client in one tap.',
          alt: 'Cadence generated client messages ready to copy and send',
        },
        {
          id: 'route',
          image: images.route,
          title: 'The best route, measured',
          desc: 'See the real road between appointments and compare kilometres and travel time saved before applying a better route.',
          alt: 'Cadence route map showing the road and saved travel time and distance',
        },
        {
          id: 'waiting',
          image: images.waiting,
          title: 'Turn cancellations into opportunities',
          desc: 'Keep flexible clients in one waiting list and use their availability to fill the right opening when a gap appears.',
          alt: 'Cadence waiting list with clients and their available times',
        },
        {
          id: 'personal',
          image: images.personal,
          title: 'Your rules, your algorithm',
          desc: 'Shape optimization around your working hours, buffers, limits and planning preferences. Cadence adapts to how you work.',
          alt: 'Cadence scheduling preferences used to personalize optimization',
        },
      ],
    },
    mobile: {
      badge: 'Works like an app',
      title: 'Your whole schedule, in your pocket',
      desc: 'Optimize between clients, book by voice on the go, copy a ready-made message while walking out the door. Cadence works right from your phone.',
    },
    features: [
      { id: 'optimize', title: 'Auto-optimized schedule', desc: 'One click builds the best possible day — respecting every rule you set.' },
      { id: 'language', title: 'Natural language AI', desc: 'Type “Paola can come Wed or Fri” and Cadence turns it into a plan.' },
      { id: 'control', title: 'You stay in control', desc: 'Every change is a preview. Accept, reject, compare, undo. Always.' },
      { id: 'insights', title: 'Revenue insights', desc: 'Occupancy, idle time, revenue — the metrics that actually matter.' },
      { id: 'business', title: 'Works for any business', desc: 'Clinics, salons, trainers, consultants, vets. Not tailored to one.' },
    ],
    footer: {
      terms: 'Terms',
      privacy: 'Privacy',
      contact: 'Contact',
      credit: 'Built by Marco Marazzi',
      disclaimer: 'Cadence is a demo / prototype — not for real professional, clinical or patient data. Use at your own risk.',
    },
    demo: {
      button: 'Try the full app (demo login)',
      credentials: 'or log in with',
      error: 'Could not open the demo account',
    },
    phone: {
      alt: 'Cadence mobile app',
      placeholder: 'Product screenshot coming soon',
      cards: [
        { title: '120 min recovered', meta: 'This week · automatic' },
        { title: 'Message ready ✓', meta: 'Copy & send in one tap' },
        { title: 'Booked by voice', meta: '“Marco, Tuesday 3pm”' },
      ],
    },
  },
  it: {
    header: {
      demo: 'Prova la demo',
      login: 'Accedi',
      started: 'Inizia',
    },
    hero: {
      badge: 'Agenda con IA',
      title: 'Smetti di sacrificare la domenica per organizzare la settimana',
      desc: 'Se il tuo lavoro vive di appuntamenti, conosci il problema: sere e weekend passati a incastrarli a mano. Cadence ricostruisce tutta la settimana nel modo migliore, con un clic.',
      tryFree: 'Prova gratis',
      tryNoAccount: 'Prova senza account',
    },
    value: {
      heading: 'Lascia che Cadence costruisca la settimana per te',
      desc: 'Fisioterapisti, osteopati, saloni, trainer e freelance sprecano sere e weekend spostando appuntamenti per chiudere i buchi. È un puzzle settimanale reale e stancante. Cadence lo risolve: parla, ottimizza, fatto.',
      title: 'Linguaggio naturale e voce',
      detail: 'Registra clienti e appuntamenti parlando. Niente moduli o tastiera: detta le disponibilità e Cadence le organizza.',
      storyCta: 'Provalo — nessun account necessario',
    },
    story: {
      ariaLabel: 'Come funziona Cadence',
      steps: [
        {
          id: 'voice',
          image: images.voice,
          title: 'Prenota con la voce',
          desc: 'Aggiungi clienti e appuntamenti parlando. Di’ “Marco martedì alle 15” e Cadence completa il resto, comprese le disponibilità.',
          alt: 'Interfaccia vocale Cadence che trascrive un nuovo appuntamento',
        },
        {
          id: 'gaps',
          image: images.gaps,
          title: 'Una settimana piena di buchi',
          desc: 'Molte settimane sono così: appuntamenti sparsi e tempi morti in mezzo, ore pagate ma non utilizzate.',
          alt: 'Calendario Cadence prima dell’ottimizzazione con buchi tra gli appuntamenti',
          imgMax: 'max-w-[440px]',
        },
        {
          id: 'suggestions',
          image: images.suggestions,
          title: 'Suggerimenti intelligenti, decidi tu',
          desc: 'Con un clic Cadence propone quali appuntamenti anticipare. Accetta o salta ogni mossa: nulla cambia finché non confermi.',
          alt: 'Anteprima Cadence con spostamenti di appuntamenti suggeriti',
          imgMax: 'max-w-[300px]',
        },
        {
          id: 'optimized',
          image: images.optimized,
          title: 'Una settimana compatta e ottimizzata',
          desc: 'Stessi appuntamenti, centinaia di minuti recuperati automaticamente, sempre rispettando le tue regole.',
          alt: 'Calendario Cadence dopo l’ottimizzazione con agenda compatta',
        },
        {
          id: 'messages',
          image: images.messages,
          title: 'Messaggi pronti da inviare',
          desc: 'Per ogni appuntamento spostato, Cadence prepara un messaggio cordiale da copiare e inviare con un tocco.',
          alt: 'Messaggi per clienti generati da Cadence e pronti da copiare',
        },
        {
          id: 'route',
          image: images.route,
          title: 'La rotta migliore, misurata',
          desc: 'Guarda la strada reale tra gli appuntamenti e confronta chilometri e tempo risparmiati prima di applicare il percorso migliore.',
          alt: 'Mappa Cadence con percorso stradale e risparmio di tempo e distanza',
        },
        {
          id: 'waiting',
          image: images.waiting,
          title: 'Trasforma le cancellazioni in opportunità',
          desc: 'Tieni i clienti flessibili in una waiting list e usa le loro disponibilità per riempire il buco giusto.',
          alt: 'Waiting list Cadence con clienti e relative disponibilità',
        },
        {
          id: 'personal',
          image: images.personal,
          title: 'Le tue regole, il tuo algoritmo',
          desc: 'Adatta l’ottimizzazione a orari, pause, limiti e preferenze di pianificazione. Cadence segue il tuo modo di lavorare.',
          alt: 'Preferenze Cadence usate per personalizzare l’ottimizzazione',
        },
      ],
    },
    mobile: {
      badge: 'Funziona come un’app',
      title: 'Tutta la tua agenda, in tasca',
      desc: 'Ottimizza tra un cliente e l’altro, prenota a voce e copia un messaggio pronto mentre sei in movimento. Cadence funziona dal telefono.',
    },
    features: [
      { id: 'optimize', title: 'Agenda ottimizzata automaticamente', desc: 'Un clic costruisce la giornata migliore rispettando tutte le tue regole.' },
      { id: 'language', title: 'IA in linguaggio naturale', desc: 'Scrivi “Paola può mercoledì o venerdì” e Cadence lo trasforma in un piano.' },
      { id: 'control', title: 'Il controllo resta a te', desc: 'Ogni modifica è un’anteprima. Accetta, rifiuta, confronta o annulla.' },
      { id: 'insights', title: 'Dati che contano', desc: 'Occupazione, tempi morti e ricavi: le metriche davvero utili.' },
      { id: 'business', title: 'Per ogni attività', desc: 'Studi, saloni, trainer, consulenti e veterinari. Non un solo settore.' },
    ],
    footer: {
      terms: 'Termini',
      privacy: 'Privacy',
      contact: 'Contatti',
      credit: 'Creato da Marco Marazzi',
      disclaimer: 'Cadence è una demo / un prototipo: non usare dati professionali, clinici o di pazienti reali. Utilizzo a proprio rischio.',
    },
    demo: {
      button: 'Prova l’app completa (accesso demo)',
      credentials: 'oppure accedi con',
      error: 'Impossibile aprire l’account demo',
    },
    phone: {
      alt: 'App mobile Cadence',
      placeholder: 'Screenshot del prodotto in arrivo',
      cards: [
        { title: '120 min recuperati', meta: 'Questa settimana · automatico' },
        { title: 'Messaggio pronto ✓', meta: 'Copia e invia con un tocco' },
        { title: 'Prenotato a voce', meta: '“Marco, martedì alle 15”' },
      ],
    },
  },
  es: {
    header: {
      demo: 'Probar la demo',
      login: 'Iniciar sesión',
      started: 'Empezar',
    },
    hero: {
      badge: 'Agenda con IA',
      title: 'Deja de perder el domingo organizando la próxima semana',
      desc: 'Si tu trabajo depende de citas, conoces el problema: noches y fines de semana ordenándolas a mano. Cadence reconstruye toda tu semana de la mejor forma posible con un clic.',
      tryFree: 'Probar gratis',
      tryNoAccount: 'Probar sin cuenta',
    },
    value: {
      heading: 'Deja que Cadence construya tu semana',
      desc: 'Fisioterapeutas, osteópatas, salones, entrenadores y autónomos pasan noches y fines de semana moviendo citas para cerrar huecos. Es un rompecabezas semanal agotador. Cadence lo resuelve: habla, optimiza y listo.',
      title: 'Lenguaje natural y voz',
      detail: 'Registra clientes y citas hablando. Sin formularios ni teclado: dicta sus disponibilidades y Cadence las organiza.',
      storyCta: 'Pruébalo — sin crear una cuenta',
    },
    story: {
      ariaLabel: 'Cómo funciona Cadence',
      steps: [
        {
          id: 'voice',
          image: images.voice,
          title: 'Reserva con la voz',
          desc: 'Añade clientes y citas hablando. Di “Marco el martes a las 15” y Cadence completa el resto, incluidas sus disponibilidades.',
          alt: 'Interfaz de voz de Cadence transcribiendo una nueva cita',
        },
        {
          id: 'gaps',
          image: images.gaps,
          title: 'Una semana llena de huecos',
          desc: 'Muchas semanas se ven así: citas dispersas y tiempos muertos entre ellas, horas pagadas que no se aprovechan.',
          alt: 'Calendario Cadence antes de optimizar con huecos entre citas',
          imgMax: 'max-w-[440px]',
        },
        {
          id: 'suggestions',
          image: images.suggestions,
          title: 'Sugerencias inteligentes, tú decides',
          desc: 'Con un clic, Cadence propone qué citas adelantar. Acepta o descarta cada cambio: nada se modifica hasta que confirmas.',
          alt: 'Vista previa de Cadence con movimientos de citas sugeridos',
          imgMax: 'max-w-[300px]',
        },
        {
          id: 'optimized',
          image: images.optimized,
          title: 'Una semana compacta y optimizada',
          desc: 'Las mismas citas, cientos de minutos recuperados automáticamente y siempre dentro de tus reglas.',
          alt: 'Calendario Cadence optimizado con una agenda compacta',
        },
        {
          id: 'messages',
          image: images.messages,
          title: 'Mensajes listos para enviar',
          desc: 'Por cada cita movida, Cadence prepara un mensaje amable que puedes copiar y enviar con un toque.',
          alt: 'Mensajes para clientes generados por Cadence y listos para copiar',
        },
        {
          id: 'route',
          image: images.route,
          title: 'La mejor ruta, medida',
          desc: 'Consulta la carretera real entre citas y compara kilómetros y tiempo ahorrados antes de aplicar una ruta mejor.',
          alt: 'Mapa de Cadence con la ruta y el ahorro de tiempo y distancia',
        },
        {
          id: 'waiting',
          image: images.waiting,
          title: 'Convierte cancelaciones en oportunidades',
          desc: 'Guarda clientes flexibles en una lista de espera y usa su disponibilidad para llenar el hueco adecuado.',
          alt: 'Lista de espera de Cadence con clientes y sus disponibilidades',
        },
        {
          id: 'personal',
          image: images.personal,
          title: 'Tus reglas, tu algoritmo',
          desc: 'Adapta la optimización a horarios, pausas, límites y preferencias de planificación. Cadence sigue tu forma de trabajar.',
          alt: 'Preferencias de Cadence para personalizar la optimización',
        },
      ],
    },
    mobile: {
      badge: 'Funciona como una app',
      title: 'Toda tu agenda, en el bolsillo',
      desc: 'Optimiza entre clientes, reserva por voz y copia un mensaje preparado mientras te desplazas. Cadence funciona desde el móvil.',
    },
    features: [
      { id: 'optimize', title: 'Agenda optimizada automáticamente', desc: 'Un clic construye el mejor día respetando todas tus reglas.' },
      { id: 'language', title: 'IA en lenguaje natural', desc: 'Escribe “Paola puede el miércoles o el viernes” y Cadence lo convierte en un plan.' },
      { id: 'control', title: 'Tú mantienes el control', desc: 'Cada cambio es una vista previa. Acepta, rechaza, compara o deshaz.' },
      { id: 'insights', title: 'Datos que importan', desc: 'Ocupación, tiempo muerto e ingresos: las métricas realmente útiles.' },
      { id: 'business', title: 'Para cualquier negocio', desc: 'Clínicas, salones, entrenadores, consultores y veterinarios.' },
    ],
    footer: {
      terms: 'Términos',
      privacy: 'Privacidad',
      contact: 'Contacto',
      credit: 'Creado por Marco Marazzi',
      disclaimer: 'Cadence es una demo / un prototipo: no debe usarse con datos profesionales, clínicos ni de pacientes reales. Úsalo bajo tu responsabilidad.',
    },
    demo: {
      button: 'Probar la app completa (acceso demo)',
      credentials: 'o inicia sesión con',
      error: 'No se pudo abrir la cuenta demo',
    },
    phone: {
      alt: 'App móvil Cadence',
      placeholder: 'Captura del producto próximamente',
      cards: [
        { title: '120 min recuperados', meta: 'Esta semana · automático' },
        { title: 'Mensaje listo ✓', meta: 'Copia y envía con un toque' },
        { title: 'Reservado por voz', meta: '“Marco, martes a las 15”' },
      ],
    },
  },
}

export function isLandingLocale(value: string | null): value is LandingLocale {
  return LANDING_LOCALES.includes(value as LandingLocale)
}
