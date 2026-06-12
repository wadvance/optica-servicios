import { jsPDF } from "jspdf";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { cn } from "./utils/cn";
import { supabase } from "./lib/supabase";
import { sendRegistrationEmail } from "./lib/email";
import { loadAllSeedData, saveInventory, savePurchases, saveServicePayments, saveCustomers, saveInvoices, saveAppointments, saveUserAccounts, getBackups, restoreFromBackup } from "./lib/supabase-data";
import ChatBot from "./components/ChatBot";

type Role = "Super Admin" | "Administrador" | "Cliente";
const isAdminRole = (r: Role) => r === "Super Admin" || r === "Administrador";
type AdminView = "panel" | "inventario" | "compras" | "facturacion" | "historias" | "avances" | "servicios" | "usuarios" | "cumplimiento" | "ia" | "resultados";
type ClientView = "portal" | "mis-facturas" | "recetas" | "citas" | "resultados" | "ia";
type View = AdminView | ClientView;

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  model: string;
  supplier: string;
  stock: number;
  minStock: number;
  cost: number;
  price: number;
  taxRate: number;
  location: string;
  status: "Activo" | "Bajo stock" | "Servicio";
};

export type PurchaseLine = {
  description: string;
  qty: number;
  unitPrice: number;
  barcode: string;
};

export type PurchaseOrder = {
  id: string;
  supplier: string;
  ruc: string;
  dv: string;
  date: string;
  status: "Pendiente" | "Recibida" | "Pagada";
  lines: PurchaseLine[];
  subtotal: number;
  tax: number;
  total: number;
};

type ServiceCategory = "Servicios publicos" | "Telecomunicaciones" | "Financiero" | "Alquiler" | "Nomina" | "Seguros" | "Impuestos";

type TechAdvance = {
  id: string;
  title: string;
  category: string;
  description: string;
  benefits: string;
  badge: "Nuevo" | "Popular" | "Premium";
  priceRange: string;
};

export type ServicePayment = {
  id: string;
  service: string;
  provider: string;
  category: ServiceCategory;
  dueDate: string;
  amount: number;
  status: "Pendiente" | "Pagado" | "Vence pronto";
  method: string;
};

export type Customer = {
  id: string;
  name: string;
  document: string;
  dv: string;
  email: string;
  phone: string;
  address: string;
  prescription: string;
  lastVisit: string;
  balance: number;
};

export type InvoiceLine = {
  itemId: string;
  description: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
};

export type Invoice = {
  id: string;
  customerId: string;
  customer: string;
  document: string;
  dv: string;
  date: string;
  status: "Borrador" | "Emitida" | "Pagada";
  payment: string;
  cufe: string;
  cafe: string;
  lines: InvoiceLine[];
};

export type Appointment = {
  id: string;
  customerId: string;
  date: string;
  time: string;
  reason: string;
  status: "Solicitada" | "Confirmada" | "Completada";
};

export type UserAccount = {
  id: string;
  name: string;
  role: Role;
  email: string;
  status: "Activo" | "Pendiente";
};

export type ExamResult = {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  odSphere: number;
  odCylinder: number;
  odAxis: number;
  oiSphere: number;
  oiCylinder: number;
  oiAxis: number;
  add: number;
  dip: number;
  needsLenses: boolean;
  lensType: string;
  notes: string;
  status: "Pendiente" | "Completado";
};

type AuthUser = {
  email: string;
  password: string;
  createdAt: string;
};

type AuthMode = "registro" | "ingreso";

type BarcodeResult = {
  rawValue: string;
};

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
};

type BarcodeDetectorConstructor = new () => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

const PANAMA_TAX_RATE = 0.07;

const business = {
  name: "Servicios Ópticos Profesionales",
  owner: "Jorge Tello",
  ruc: "RUC demo pendiente",
  dv: "00",
  address: "Calle C Nte, diagonal a la Policlinica Gustavo A. Ross, frente al Banco General, costado del edificio 7 pisos, David",
  phone: "+507 6000-0000",
  celular: "66827364",
  fijo: "730 1045",
  whatsapp: "50766827364",
  hours: "Lunes a viernes 8:00 am a 5:30 pm, Sábado 8:00 am a 4:00 pm",
};

const adminNav: { id: AdminView; label: string; description: string }[] = [
  { id: "panel", label: "Panel", description: "Resumen operativo" },
  { id: "inventario", label: "Inventario", description: "Monturas, lentes y accesorios" },
  { id: "compras", label: "Compras", description: "Proveedores y credito fiscal" },
  { id: "facturacion", label: "Facturacion", description: "Cliente, CUFE y CAFE" },
  { id: "historias", label: "Historias Clinicas", description: "Examenes, recetas y facturas" },
  { id: "avances", label: "Avances", description: "Tecnologia en lentes y gafas" },
  { id: "servicios", label: "Pagos", description: "Servicios y vencimientos" },
  { id: "usuarios", label: "Clientes", description: "Administrador y clientes" },
  { id: "cumplimiento", label: "Panama", description: "DGI, SFEP e ITBMS" },
  { id: "ia", label: "Conocimiento", description: "Guia optica y tecnologia" },
  { id: "resultados", label: "Resultados", description: "Examenes de vision" },
];

const clientNav: { id: ClientView; label: string; description: string }[] = [
  { id: "portal", label: "Portal", description: "Inicio del cliente" },
  { id: "mis-facturas", label: "Facturas", description: "Estado de pagos" },
  { id: "recetas", label: "Recetas", description: "Formula optica" },
  { id: "citas", label: "Citas", description: "Solicitudes" },
  { id: "resultados", label: "Resultados", description: "Mis examenes de vision" },
  { id: "ia", label: "Asistente IA", description: "Chatbot optico inteligente" },
];

const inventorySeed: InventoryItem[] = [
  {
    id: "INV-001",
    sku: "MNT-AC-101",
    name: "Montura acetato profesional",
    category: "Monturas",
    model: "Clasica",
    supplier: "Distribuidora Visual PA",
    stock: 18,
    minStock: 8,
    cost: 24,
    price: 75,
    taxRate: PANAMA_TAX_RATE,
    location: "Vitrina A",
    status: "Activo",
  },
  {
    id: "INV-002",
    sku: "MNT-MT-204",
    name: "Montura metal liviano",
    category: "Monturas",
    model: "Metalica",
    supplier: "OptiSupply Panama",
    stock: 7,
    minStock: 10,
    cost: 29,
    price: 89,
    taxRate: PANAMA_TAX_RATE,
    location: "Vitrina B",
    status: "Bajo stock",
  },
  {
    id: "INV-003",
    sku: "LEN-PROG-330",
    name: "Lente progresivo antirreflejo",
    category: "Lentes oftalmicos",
    model: "Progresivo",
    supplier: "Laboratorio Central Optico",
    stock: 32,
    minStock: 12,
    cost: 58,
    price: 145,
    taxRate: PANAMA_TAX_RATE,
    location: "Laboratorio",
    status: "Activo",
  },
  {
    id: "INV-004",
    sku: "LEN-BLUE-220",
    name: "Filtro azul monofocal",
    category: "Lentes oftalmicos",
    model: "Monofocal",
    supplier: "Laboratorio Central Optico",
    stock: 24,
    minStock: 10,
    cost: 20,
    price: 65,
    taxRate: PANAMA_TAX_RATE,
    location: "Laboratorio",
    status: "Activo",
  },
  {
    id: "INV-005",
    sku: "LC-HID-006",
    name: "Lentes de contacto hidratados",
    category: "Lentes de contacto",
    model: "Hidratado",
    supplier: "Contact Vision Group",
    stock: 11,
    minStock: 14,
    cost: 14,
    price: 38,
    taxRate: PANAMA_TAX_RATE,
    location: "Gabinete",
    status: "Bajo stock",
  },
  {
    id: "INV-006",
    sku: "ACC-SOL-100",
    name: "Solucion multiproposito 360 ml",
    category: "Accesorios",
    model: "Estandar",
    supplier: "Contact Vision Group",
    stock: 36,
    minStock: 18,
    cost: 5,
    price: 12,
    taxRate: PANAMA_TAX_RATE,
    location: "Mostrador",
    status: "Activo",
  },
  {
    id: "INV-007",
    sku: "SRV-EXA-001",
    name: "Examen visual completo",
    category: "Servicios clinicos",
    model: "",
    supplier: "Servicios internos",
    stock: 999,
    minStock: 0,
    cost: 0,
    price: 30,
    taxRate: 0,
    location: "Consultorio",
    status: "Servicio",
  },
];

const purchasesSeed: PurchaseOrder[] = [
  {
    id: "OC-0008",
    supplier: "Laboratorio Central Optico",
    ruc: "1556842-1-742001",
    dv: "41",
    date: "2026-05-03",
    status: "Recibida",
    lines: [
      { description: "Lentes progresivos", qty: 20, unitPrice: 25, barcode: "LEN-PROG-330" },
      { description: "Monturas metal", qty: 12, unitPrice: 40, barcode: "MNT-MT-204" },
      { description: "Lentes antirreflejo", qty: 10, unitPrice: 38, barcode: "LEN-BLUE-220" },
    ],
    subtotal: 1680,
    tax: 117.6,
    total: 1797.6,
  },
  {
    id: "OC-0009",
    supplier: "OptiSupply Panama",
    ruc: "890122-1-533221",
    dv: "09",
    date: "2026-05-10",
    status: "Pendiente",
    lines: [
      { description: "Soluciones multiproposito", qty: 48, unitPrice: 8.5, barcode: "ACC-SOL-100" },
      { description: "Estuches para lentes", qty: 24, unitPrice: 5, barcode: "" },
      { description: "Paños microfibra", qty: 36, unitPrice: 3.5, barcode: "" },
    ],
    subtotal: 720,
    tax: 50.4,
    total: 770.4,
  },
  {
    id: "OC-0010",
    supplier: "Contact Vision Group",
    ruc: "1992021-1-690010",
    dv: "66",
    date: "2026-05-12",
    status: "Pagada",
    lines: [
      { description: "Lentes de contacto diarios", qty: 30, unitPrice: 15, barcode: "LC-HID-006" },
      { description: "Lentes de contacto mensuales", qty: 20, unitPrice: 22, barcode: "" },
    ],
    subtotal: 930,
    tax: 65.1,
    total: 995.1,
  },
];

const serviceSeed: ServicePayment[] = [
  { id: "PS-001", service: "Energia electrica", provider: "ENSA / Naturgy", category: "Servicios publicos", dueDate: "2026-06-15", amount: 148.45, status: "Vence pronto", method: "ACH Banco General" },
  { id: "PS-002", service: "Agua", provider: "IDAAN", category: "Servicios publicos", dueDate: "2026-06-20", amount: 38.1, status: "Pendiente", method: "Banca en linea" },
  { id: "PS-003", service: "Internet y telefonia", provider: "Proveedor local", category: "Telecomunicaciones", dueDate: "2026-06-08", amount: 74.99, status: "Pagado", method: "Tarjeta" },
  { id: "PS-004", service: "Plan celular", provider: "Tigo / Digicel / Movistar", category: "Telecomunicaciones", dueDate: "2026-06-18", amount: 35.5, status: "Pendiente", method: "Banca en linea" },
  { id: "PS-005", service: "Tarjeta de credito", provider: "Banco General / BAC Credomatic", category: "Financiero", dueDate: "2026-06-25", amount: 250, status: "Pendiente", method: "Pago automatico" },
  { id: "PS-006", service: "PAC / facturacion electronica", provider: "Proveedor Autorizado Calificado", category: "Impuestos", dueDate: "2026-06-30", amount: 45, status: "Pendiente", method: "Transferencia" },
  { id: "PS-007", service: "Declaracion ITBMS", provider: "DGI e-Tax 2.0", category: "Impuestos", dueDate: "2026-06-15", amount: 0, status: "Pendiente", method: "Formulario 430" },
  { id: "PS-008", service: "Alquiler local", provider: "Arrendador", category: "Alquiler", dueDate: "2026-07-01", amount: 600, status: "Pendiente", method: "Transferencia" },
  { id: "PS-009", service: "Seguro medico", provider: "Aseguradora", category: "Seguros", dueDate: "2026-06-28", amount: 85, status: "Pendiente", method: "Tarjeta" },
];

const techAdvancesSeed: TechAdvance[] = [
  {
    id: "TA-001",
    title: "Lentes con filtro de luz azul",
    category: "Proteccion digital",
    description: "Bloquean la luz azul nociva de pantallas digitales (420-480 nm). Reducen fatiga visual, mejoran el sueno y previenen el envejecimiento prematuro de la retina. Ideales para profesionales que pasan mas de 6 horas frente a computadoras y dispositivos moviles.",
    benefits: "Reduce fatiga visual en 78% · Mejora calidad del sueno · Anti-reflejo premium · UV400",
    badge: "Popular",
    priceRange: "B/. 35 - B/. 90",
  },
  {
    id: "TA-002",
    title: "Lentes progresivos digitales Free Form",
    category: "Multifocales",
    description: "Tecnologia Free Form con superficie digitalizada punto a punto. Proporcionan una transicion suave entre distancia, intermedia y cercana sin lineas de separation. Calculados con algoritmos que eliminan las distorsiones perifericas de los progresivos convencionales.",
    benefits: "Vision natural en todos los campos · Sin distorsion periferica · Adaptacion en 3-5 dias · Personalizados",
    badge: "Premium",
    priceRange: "B/. 180 - B/. 400",
  },
  {
    id: "TA-003",
    title: "Fotocromaticos de respuesta rapida Gen 8",
    category: "Lentes inteligentes",
    description: "Ultima generacion de lentes fotocromaticos que se oscurecen en menos de 30 segundos bajo luz solar directa y se aclaran en 3-5 minutos en interiores. Tecnologia de color neutro que mantiene la fidelidad cromatica en todo momento, incluso dentro del auto (protegen detras del parabrisas).",
    benefits: "Activacion en <30s · Desactivacion en <5min · Protege dentro del auto · 100% UV",
    badge: "Nuevo",
    priceRange: "B/. 90 - B/. 220",
  },
  {
    id: "TA-004",
    title: "Lentes antifatiga con microlentes",
    category: "Bienestar visual",
    description: "Incorporan un pequeno segmento de microlentes en la parte inferior que relaja la acomodacion del ojo en tareas de cerca. Perfectos para personas jovenes que empiezan con sintomas de presbicia temprana o fatiga visual por uso prolongado de dispositivos.",
    benefits: "Relaja la acomodacion ocular · Reduce cefaleas tensionales · Transicion invisible · Diseno deportivo disponible",
    badge: "Popular",
    priceRange: "B/. 60 - B/. 140",
  },
  {
    id: "TA-005",
    title: "Alta definicion 1.74 / 1.76 Ultra-delgado",
    category: "Materiales premium",
    description: "Lentes de indice ultra-alto 1.74 y 1.76 que reducen hasta un 50% el grosor y peso comparado con lentes estandar. Ideales para graduaciones altas (mas de +/-4.00). Incluyen recubrimiento antirreflectante, hidrofobico y oleofobico premium.",
    benefits: "50% mas delgado · 40% mas liviano · Sin aberraciones cromaticas · Resistente a rayones",
    badge: "Premium",
    priceRange: "B/. 150 - B/. 350",
  },
  {
    id: "TA-006",
    title: "Lentes para gaming y realidad virtual",
    category: "Tecnologia inmersiva",
    description: "Lentes especializados con filtro de luz azul optimizado para sesiones largas frente a pantallas. Curvatura envolvente con campo visual ampliado, antirreflejo multicapa y tratamiento antiestatico. Reducen el parpadeo y mejoran el contraste en entornos oscuros.",
    benefits: "Filtro azul optimizado · Anti-parpadeo · Campo visual amplio · Anti-estatico",
    badge: "Nuevo",
    priceRange: "B/. 75 - B/. 180",
  },
  {
    id: "TA-007",
    title: "Recubrimiento premium Crizal / Duravision",
    category: "Tratamientos",
    description: "Recubrimiento antirreflectante de ultima generacion que elimina reflejos en ambas caras del lente. Incorpora capa hidrofobica que repele agua y polvo, tratamiento oleofobico anti-huellas y proteccion anti-rayaduras. Incluye proteccion UV400 integral.",
    benefits: "Sin reflejos · Repelente al agua y polvo · Anti-huellas · Anti-rayaduras · UV400",
    badge: "Popular",
    priceRange: "B/. 25 - B/. 60",
  },
  {
    id: "TA-008",
    title: "Monturas inteligentes con audio integrado",
    category: "Smart eyewear",
    description: "Monturas de acetato hipoalergenico con altavoces direccionales invisibles integrados en las patillas. Conectividad Bluetooth 5.3 para llamadas manos libres y reproduccion musical. Bateria de 8 horas, micrófono con cancelacion de ruido y control tactil.",
    benefits: "Llamadas manos libres · Musica discreta · 8h bateria · Control tactil · Hipoalergenico",
    badge: "Nuevo",
    priceRange: "B/. 200 - B/. 450",
  },
  {
    id: "TA-009",
    title: "Lentes para conductores con polarizacion HD",
    category: "Lentes especiales",
    description: "Lentes polarizados de alta definicion que eliminan el deslumbramiento en carretera y mejoran el contraste en condiciones de lluvia o baja luminosidad. Curvatura envolvente para proteccion periferica. Filtro selectivo que realza el rojo y verde en semáforos.",
    benefits: "Elimina deslumbramiento · Mejora contraste en lluvia · Proteccion periferica · Realza semaforos",
    badge: "Popular",
    priceRange: "B/. 45 - B/. 120",
  },
  {
    id: "TA-010",
    title: "Trivex de alto impacto",
    category: "Materiales premium",
    description: "Material Trivex de alta resistencia al impacto (supera pruebas balisticas militares). Ideal para ninos, deportistas y entornos laborales exigentes. Optica superior al policarbonato con mejor claridad visual, menor distorsion y resistencia quimica excepcional.",
    benefits: "Maxima resistencia al impacto · Optica superior al policarbonato · Resistencia quimica · 100% UV",
    badge: "Premium",
    priceRange: "B/. 80 - B/. 200",
  },
];

const customersSeed: Customer[] = [
  {
    id: "CLI-001",
    name: "María González",
    document: "8-888-2026",
    dv: "12",
    email: "maria.gonzalez@example.com",
    phone: "+507 6123-4567",
    prescription: "OD -1.25 / -0.50 x 90, OI -1.00 / -0.25 x 85, ADD +1.50, DP 62",
    lastVisit: "2026-05-11",
    balance: 0,
  },
  {
    id: "CLI-002",
    name: "Carlos Rivera",
    document: "E-8-71000",
    dv: "00",
    email: "carlos.rivera@example.com",
    phone: "+507 6234-8899",
    prescription: "OD +0.75 / -0.75 x 120, OI +0.50 / -0.50 x 110, DP 64",
    lastVisit: "2026-04-28",
    balance: 48,
  },
  {
    id: "CLI-003",
    name: "Comercial Vista Azul, S.A.",
    document: "1556842-1-742001",
    dv: "41",
    email: "compras@vistaazul.example",
    phone: "+507 6300-1000",
    prescription: "Cuenta corporativa: ventas con RUC/DV, orden de compra requerida",
    lastVisit: "2026-05-17",
    balance: 112,
  },
];

const invoicesSeed: Invoice[] = [
  {
    id: "FE-00021",
    customerId: "CLI-001",
    customer: "María González",
    document: "8-888-2026",
    dv: "12",
    date: "2026-05-18",
    status: "Pagada",
    payment: "Tarjeta Clave",
    cufe: "FEPA260518SOP00021A9B8C7",
    cafe: "CAFE-00021-SOP",
    lines: [
      { itemId: "INV-003", description: "Lente progresivo antirreflejo", qty: 1, unitPrice: 145, taxRate: PANAMA_TAX_RATE },
      { itemId: "INV-001", description: "Montura acetato profesional", qty: 1, unitPrice: 75, taxRate: PANAMA_TAX_RATE },
      { itemId: "INV-007", description: "Examen visual completo", qty: 1, unitPrice: 30, taxRate: 0 },
    ],
  },
  {
    id: "FE-00022",
    customerId: "CLI-002",
    customer: "Carlos Rivera",
    document: "E-8-71000",
    dv: "00",
    date: "2026-05-20",
    status: "Emitida",
    payment: "Yappy / ACH",
    cufe: "FEPA260520SOP00022F4E2D1",
    cafe: "CAFE-00022-SOP",
    lines: [
      { itemId: "INV-005", description: "Lentes de contacto hidratados", qty: 2, unitPrice: 38, taxRate: PANAMA_TAX_RATE },
      { itemId: "INV-006", description: "Solucion multiproposito 360 ml", qty: 1, unitPrice: 12, taxRate: PANAMA_TAX_RATE },
    ],
  },
];

const appointmentsSeed: Appointment[] = [
  { id: "CT-015", customerId: "CLI-001", date: "2026-06-12", time: "09:00", reason: "Ajuste de montura y control visual", status: "Confirmada" },
  { id: "CT-016", customerId: "CLI-002", date: "2026-06-14", time: "14:30", reason: "Revision de lentes de contacto", status: "Solicitada" },
];

const usersSeed: UserAccount[] = [
  { id: "USR-001", name: "Jorge Tello", role: "Administrador", email: "jorge.tello@sop.example", status: "Activo" },
  { id: "USR-002", name: "María González", role: "Cliente", email: "maria.gonzalez@example.com", status: "Activo" },
  { id: "USR-003", name: "Carlos Rivera", role: "Cliente", email: "carlos.rivera@example.com", status: "Activo" },
];

function usePersistentState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(key);
      return storedValue ? (JSON.parse(storedValue) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local storage can be blocked in private browsing.
    }
  }, [key, value]);

  return [value, setValue];
}

function formatMoney(value: number) {
  return `B/. ${value.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function lineSubtotal(line: InvoiceLine) {
  return line.qty * line.unitPrice;
}

function lineTax(line: InvoiceLine) {
  return lineSubtotal(line) * line.taxRate;
}

function invoiceTotals(lines: InvoiceLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const tax = lines.reduce((sum, line) => sum + lineTax(line), 0);
  return { subtotal, tax, total: subtotal + tax };
}

function generateCufe(nextNumber: number) {
  return `FEPA${new Date().toISOString().slice(2, 10).replace(/-/g, "")}SOP${String(nextNumber).padStart(5, "0")}${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function whatsAppUrl(roleOrMessage?: Role | string, activeClientName?: string, fromFab = false) {
  let message: string;
  if (typeof roleOrMessage === "string") {
    message = roleOrMessage;
  } else if (roleOrMessage === "Cliente" && activeClientName) {
    message = fromFab
      ? `Hola, soy ${activeClientName}. Necesito asistencia de ${business.name}.`
      : `Hola, soy ${activeClientName} y deseo comunicarme con la optica.`;
  } else if (roleOrMessage === "Administrador" || roleOrMessage === "Super Admin") {
    message = `Hola, soy ${business.owner} de ${business.name}.`;
  } else {
    message = `Hola, deseo comunicarme con ${business.name}.`;
  }
  return `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(message)}`;
}

function passwordRules(password: string) {
  return [
    { label: "Maximo 12 caracteres", valid: password.length > 0 && password.length <= 12 },
    { label: "Incluye una mayuscula", valid: /[A-Z]/.test(password) },
    { label: "Incluye un numero", valid: /\d/.test(password) },
    { label: "Incluye un caracter especial", valid: /[^A-Za-z0-9]/.test(password) },
  ];
}

function validateAuthCredentials(email: string, password: string) {
  const trimmedEmail = email.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return "Ingresa un correo electronico valido.";
  }

  if (!passwordRules(password).every((rule) => rule.valid)) {
    return "La contrasena debe tener maximo 12 caracteres e incluir mayuscula, numero y caracter especial.";
  }

  return "";
}

function AuthScreen({
  registeredUser,
  onRegister,
  onLogin,
}: {
  registeredUser: AuthUser | null;
  onRegister: (username: string, password: string, role: Role) => string;
  onLogin: (username: string, password: string) => string;
}) {
  const [mode, setMode] = useState<AuthMode>(registeredUser ? "ingreso" : "registro");
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [registerRole, setRegisterRole] = useState<Role>("Administrador");
  const [message, setMessage] = useState("");
  const rules = passwordRules(form.password);

  useEffect(() => {
    setMode(registeredUser ? "ingreso" : "registro");
    setRegisterRole(registeredUser ? "Administrador" : "Super Admin");
    if (registeredUser) {
      setForm({ email: registeredUser.email, password: "" });
    } else {
      setForm({ email: "", password: "" });
    }
  }, [registeredUser]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await (mode === "registro" ? onRegister(form.email, form.password, registerRole) : onLogin(form.email, form.password));
    setMessage(result);
    setForm({ email: "", password: "" });
  }

  return (
    <div className="min-h-screen bg-[#f4f1eb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="bg-orb absolute -left-24 top-20 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl" />
        <div className="bg-orb-delayed absolute right-0 top-1/3 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />
      </div>

      <main className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="reveal-up space-y-6">
          <Logo />
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-700">Acceso seguro</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-6xl">Registro inicial para la optica</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              Crea el primer usuario para ingresar al sistema de inventario, compras, facturacion, portal de clientes y escaneo con camara desde celular.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Metric label="Clave" value="12 max." caption="Mayuscula, numero y caracter especial." tone="cyan" />
            <Metric label="Contacto" value="WhatsApp" caption="Canal directo para clientes de la optica." tone="emerald" />
          </div>
          <a className="inline-flex rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20" href={whatsAppUrl()} target="_blank" rel="noreferrer">
            Contactar por WhatsApp
          </a>
        </section>

        <section className="reveal-up rounded-[2rem] bg-white/85 p-6 shadow-2xl shadow-slate-300/50 ring-1 ring-slate-200 backdrop-blur sm:p-8">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1">
            <button className={cn("rounded-full px-4 py-3 text-sm font-black transition", mode === "registro" ? "bg-slate-950 text-white" : "text-slate-600")} onClick={() => { setMode("registro"); setRegisterRole(registeredUser ? "Administrador" : "Super Admin"); setForm({ email: "", password: "" }); }}>
              Registro
            </button>
            <button className={cn("rounded-full px-4 py-3 text-sm font-black transition", mode === "ingreso" ? "bg-slate-950 text-white" : "text-slate-600")} onClick={() => { setMode("ingreso"); setForm({ email: "", password: "" }); }} disabled={!registeredUser}>
              Ingreso
            </button>
          </div>

          <form className="mt-6 space-y-5" onSubmit={submitAuth}>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Correo electronico
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="jorge@sop.pa"
                    autoComplete="email"
                  />
                  <span className="text-xs font-medium text-slate-500">Ingresa un correo valido.</span>
                </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Contrasena
              <div className="relative">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-12 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  maxLength={12}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Escribe tu contrasena"
                  autoComplete={mode === "registro" ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {mode === "registro" && (
              <div className="grid gap-2">
                <p className="text-sm font-bold text-slate-700">Registrarse como</p>
                <div className="grid grid-cols-2 gap-2 rounded-full bg-slate-100 p-1">
                  {(registeredUser ? ["Administrador", "Cliente"] : ["Super Admin"] as Role[]).map((item) => (
                    <button key={item} type="button" className={cn("rounded-full px-4 py-3 text-sm font-black transition", registerRole === item ? "bg-slate-950 text-white" : "text-slate-600")} onClick={() => setRegisterRole(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-2 rounded-3xl bg-slate-50 p-4">
              {rules.map((rule) => (
                <div key={rule.label} className="flex items-center gap-3 text-sm">
                  <span className={cn("h-2.5 w-2.5 rounded-full", rule.valid ? "bg-emerald-500" : "bg-slate-300")} />
                  <span className={rule.valid ? "font-bold text-emerald-700" : "text-slate-500"}>{rule.label}</span>
                </div>
              ))}
            </div>

            {message && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 ring-1 ring-amber-200">{message}</p>}

            <button className="w-full rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white shadow-lg shadow-cyan-600/20">
              {mode === "registro" ? "Crear usuario e ingresar" : "Ingresar"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-950 text-sm font-black tracking-tight text-white shadow-xl shadow-slate-950/20">
        <span>SOP</span>
        <span className="lens-sweep absolute inset-0" />
      </div>
      <div>
        <h1 className="text-lg font-black leading-tight text-slate-950 sm:text-xl">{business.name}</h1>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusStyles: Record<string, string> = {
    Activo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "Bajo stock": "bg-amber-50 text-amber-700 ring-amber-200",
    Servicio: "bg-sky-50 text-sky-700 ring-sky-200",
    Pendiente: "bg-amber-50 text-amber-700 ring-amber-200",
    Recibida: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    Pagada: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Pagado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Emitida: "bg-blue-50 text-blue-700 ring-blue-200",
    Borrador: "bg-slate-100 text-slate-600 ring-slate-200",
    "Vence pronto": "bg-rose-50 text-rose-700 ring-rose-200",
    Solicitada: "bg-amber-50 text-amber-700 ring-amber-200",
    Confirmada: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    Completada: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Nuevo: "bg-blue-50 text-blue-700 ring-blue-200",
    Popular: "bg-amber-50 text-amber-700 ring-amber-200",
    Premium: "bg-purple-50 text-purple-700 ring-purple-200",
  };

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1", statusStyles[status] ?? "bg-slate-100 text-slate-700 ring-slate-200")}>{status}</span>;
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="reveal-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-700">{business.owner}</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ label, value, caption, tone = "cyan" }: { label: string; value: string; caption: string; tone?: "cyan" | "emerald" | "amber" | "slate" }) {
  const tones = {
    cyan: "from-cyan-500/15 to-blue-500/5 text-cyan-800 ring-cyan-200/70",
    emerald: "from-emerald-500/15 to-teal-500/5 text-emerald-800 ring-emerald-200/70",
    amber: "from-amber-500/15 to-orange-500/5 text-amber-800 ring-amber-200/70",
    slate: "from-slate-500/10 to-slate-500/5 text-slate-800 ring-slate-200/80",
  };

  return (
    <div className={cn("rounded-[2rem] bg-gradient-to-br p-5 ring-1", tones[tone])}>
      <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-2 text-sm leading-5 opacity-75">{caption}</p>
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/55 p-8 text-center text-slate-600">
      <p className="font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm">{subtitle}</p>
    </div>
  );
}

export default function App() {
  const [registeredUser, setRegisteredUser] = usePersistentState<AuthUser | null>("sop-auth-user", null);
  const [sessionUser, setSessionUser] = usePersistentState<string | null>("sop-session-user", null);
  const [role, setRole] = usePersistentState<Role>("sop-role", "Super Admin");
  const [activeView, setActiveView] = usePersistentState<View>("sop-view", "panel");
  const [inventory, setInventory] = usePersistentState<InventoryItem[]>("sop-inventory", inventorySeed);
  const [purchases, setPurchases] = usePersistentState<PurchaseOrder[]>("sop-purchases", purchasesSeed);
  const [servicePayments, setServicePayments] = usePersistentState<ServicePayment[]>("sop-service-payments", serviceSeed);
  const [customers, setCustomers] = usePersistentState<Customer[]>("sop-customers", customersSeed);
  const [invoices, setInvoices] = usePersistentState<Invoice[]>("sop-invoices", invoicesSeed);
  const [appointments, setAppointments] = usePersistentState<Appointment[]>("sop-appointments", appointmentsSeed);
  const [users, setUsers] = usePersistentState<UserAccount[]>("sop-users", usersSeed);
  const [techAdvances] = useState<TechAdvance[]>(techAdvancesSeed);
  const [examResults, setExamResults] = usePersistentState<ExamResult[]>("sop-exams", []);
  const [darkMode, setDarkMode] = usePersistentState<boolean>("sop-theme", true);
  const [isMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 1024);

  useEffect(() => {
    setPurchases((prev) => prev.map((p) => {
      if (!p.lines && typeof (p as any).items === "number") {
        const qty = (p as any).items || 1;
        const unitPrice = qty > 0 ? Math.round(p.subtotal / qty * 100) / 100 : 0;
        return { ...p, lines: [{ description: "Producto", qty, unitPrice, barcode: "" }] };
      }
      return p;
    }));
  }, []);

  const isStandalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
  const canInstall = !isStandalone;

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const [examForm, setExamForm] = useState({
    customerId: customers[0]?.id ?? "",
    odSphere: "-2.00",
    odCylinder: "-0.75",
    odAxis: "180",
    oiSphere: "-2.25",
    oiCylinder: "-0.50",
    oiAxis: "175",
    add: "0.00",
    dip: "64",
    needsLenses: true,
    lensType: "Progresivos",
    notes: "",
  });

  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiError, setAiError] = useState("");

  const knowledgeBase = useMemo(() => [
    {
      keywords: ["progresivo", "progresivos", "multifocal", "vision cercana", "vision lejana"],
      title: "Lentes Progresivos",
      content: "Los lentes progresivos (multifocales) corrigen vista cercana, intermedia y lejana sin lineas visibles. Ideales para presbicia. Tecnologias: Free-Form (digital) ofrece mejor campo visual. Marcas: Varilux, Zeiss Progressive, Hoyalux, Shamir Autograph. El periodo de adaptacion es de 1 a 2 semanas."
    },
    {
      keywords: ["bifocal", "bifocales", "linea visible"],
      title: "Lentes Bifocales",
      content: "Los bifocales tienen dos campos separados por una linea visible: parte superior para lejos, inferior para cerca. Son mas economicos que los progresivos pero menos esteticos. Recomendados para pacientes que no se adaptan a progresivos."
    },
    {
      keywords: ["monofocal", "monofocales", "simple vista", "un solo campo"],
      title: "Lentes Monofocales",
      content: "Los lentes monofocales tienen un solo poder en toda la superficie. Se usan para miopia (dificultad para ver lejos), hipermetropia (dificultad para ver cerca) o astigmatismo. Son los lentes mas basicos y economicos."
    },
    {
      keywords: ["fotocromatico", "fotocromaticos", "fotosensible", "transitions", "luz solar", "oscuras"],
      title: "Lentes Fotocromaticos (Transitions)",
      content: "Los lentes fotocromaticos se oscurecen automaticamente con la luz UV y se aclaran en interiores. Tecnologia Transitions Signature Gen 8: mas rapidos y oscuros que generaciones anteriores. Tambien hay lentes fotocromaticos de policarbonato y alto indice. Ideales para quienes pasan tiempo dentro y fuera."
    },
    {
      keywords: ["polarizado", "polarizados", "reflejo", "encandilamiento", "manejo", "conducir"],
      title: "Lentes Polarizados",
      content: "Los lentes polarizados eliminan el resplandor y reflejos horizontales (agua, nieve, pavimento). Ideales para conducir, pesca, deportes acuaticos y nieve. No recomendados para ver pantallas LCD (pueden verse distorsionadas). Combaten la fatiga visual por brillo excesivo."
    },
    {
      keywords: ["luz azul", "filtro azul", "pantalla", "computadora", "fatiga visual", "blue cut"],
      title: "Filtro de Luz Azul (Blue Cut)",
      content: "Los lentes con filtro de luz azul bloquean la luz HEV (alta energia visible) emitida por pantallas digitales. Reducen fatiga visual, dolores de cabeza y mejoran el sueno. Recomendados para personas que pasan mas de 4 horas frente a pantallas. Tienen un leve tono amarillo/ambar."
    },
    {
      keywords: ["antireflejo", "anti reflejo", "antirreflejante", "ar", "reflejos"],
      title: "Tratamiento Antireflejo (AR)",
      content: "El tratamiento antireflejo elimina los reflejos en la superficie del lente, mejorando la vision nocturna y la estetica. Reduce la fatiga visual. Capas adicionales: hidrofobica (repele agua), oleofobica (repele grasa), anti-rayas, anti-estatica. Es el tratamiento mas recomendado."
    },
    {
      keywords: ["policarbonato", "policarbonato", "impacto", "seguridad", "deportes", "ninos", "niños"],
      title: "Lentes de Policarbonato",
      content: "El policarbonato es un material ligero y resistente a impactos (10x mas que plastico regular). Ideal para ninos, deportes, seguridad laboral. Bloquea 100% UV. Indice de refraccion 1.59. Desventaja: menor claridad optica que el alto indice."
    },
    {
      keywords: ["alto indice", "alto índice", "1.67", "1.74", "1.76", "delgado", "liviano"],
      title: "Lentes de Alto Indice",
      content: "Los lentes de alto indice (1.67, 1.74, 1.76) son mas delgados y livianos que los convencionales. Ideales para graduaciones altas (mas de -4.00 o +4.00). Indice 1.74: hasta 50% mas delgado que plastico regular. Indice 1.76: el mas delgado disponible."
    },
    {
      keywords: ["trivex", "trivex"],
      title: "Lentes Trivex",
      content: "El Trivex es un material similar al policarbonato pero con mejor claridad optica. Resistente a impactos, bloquea 100% UV, mas liviano que el policarbonato. Ideal para graduaciones moderadas y deportes."
    },
    {
      keywords: ["acetato", "acetato", "montura", "carey", "ecologico"],
      title: "Monturas de Acetato",
      content: "Las monturas de acetato son las mas populares. Material derivado de celulosa (ecologico). Hipoalergenico, disponible en miles de colores y patrones. Marcas: Ray-Ban, Oakley, Persol. El acetato de calidad (italiano, japones) dura anos."
    },
    {
      keywords: ["titanio", "titanio", "metal", "montura metalica", "hipoalergenico"],
      title: "Monturas de Titanio",
      content: "Las monturas de titanio son ultra-livianas, resistentes a la corrosion e hipoalergenicas. Ideales para pieles sensibles. Flexon (aleacion con memoria) recupera su forma al doblarse. Beta-titanio: mas flexible que el titanio puro."
    },
    {
      keywords: ["lentes contacto", "contacto", "contactologia", "blandos", "rigidos", "desechables"],
      title: "Lentes de Contacto",
      content: "Tipos: blandos (hidrogel, silicon hidrogel), rigidos permeables a gas (RPG), especiales (esclerales, toricos, multifocales). Los de silicon hidrogel permiten 5x mas oxigeno que los convencionales. Desechables diarios: mayor higiene y comodidad. RPG: mejor agudeza visual para astigmatismo irregular."
    },
    {
      keywords: ["lentes niños", "lentes ninos", "infantil", "ninos miopia", "control miopia"],
      title: "Control de Miopia en Ninos",
      content: "Tecnologias para controlar la progresion de miopia infantil: lentes Stellest (Essilor), MiyoSmart (Hoya), lentes de contacto blandos MiSight, atropina en baja dosis. Ortokeratologia (lentes RPG nocturnos). La deteccion temprana es clave para evitar miopia alta en adultos."
    },
    {
      keywords: ["lentes deporte", "deportivos", "gafas deporte", "running", "ciclismo"],
      title: "Lentes Deportivos",
      content: "Caracteristicas: monturas envolventes, material resistente a impactos (policarbonato/Trivex), agarre antideslizante, ventilacion para evitar empanamiento. Lentes intercambiables para diferentes condiciones de luz. Marcas: Oakley, Rudy Project, Julbo, Adidas Sport."
    },
    {
      keywords: ["lentes soldar", "soldadura", "seguridad laboral", "proteccion uv"],
      title: "Lentes de Seguridad Laboral",
      content: "Normas ANSI Z87.1 (EEUU) y CE EN 166 (Europa). Tipos: anti-impacto, anti-quimicos, para soldar (filtro IR/UV). Lentes con proteccion lateral, armazon resistente. Lentes de seguridad graduados disponibles."
    },
    {
      keywords: ["lentes sol", "sol", "gafas sol", "ray ban", "polarizado uv"],
      title: "Gafas de Sol",
      content: "Categoria de proteccion UV: 0 (cosmetico) a 4 (glaciar). Buscar sello UV400 (bloquea 99-100% UVA/UVB). Polarizados: eliminan reflejos. Espectro electromagnetico: UV (100-400nm), luz visible (400-700nm), IR (700nm+). La proteccion UV no depende del color del lente."
    },
    {
      keywords: ["varilux", "zeiss", "hoya", "essilor", "shamir", "nikon", "rodentstock"],
      title: "Marcas de Lentes",
      content: "Essilor (Varilux, Crizal, Transitions) - lider mundial. Zeiss (precision alemana, BlueGuard). Hoya (MiyoSmart, Nulux). Shamir (Autograph, Glacier). Nikon (SeeCoat). Rodenstock (DNEye). Cada marca tiene tecnologias exclusivas de tratamiento y diseno digital."
    },
    {
      keywords: ["crizal", "tratamiento", "sapphire", "rock", "essilor"],
      title: "Tratamientos Crizal (Essilor)",
      content: "Crizal Rock: resistencia a rayaduras (5x mas duro). Crizal Sapphire: el mas resistente (36% menos reflejos). Crizal Prevencia: filtra luz azul. Crizal Easy: relacion calidad-precio. Todos incluyen antireflejo, hidrofobico, oleofobico, anti-estatico y proteccion UV."
    },
    {
      keywords: ["graduacion", "receta", "prescripcion", "esfera", "cilindro", "eje", "adicion"],
      title: "Como leer una Receta Optica",
      content: "Esfera (SPH): graduacion de miopia (-) o hipermetropia (+). Cilindro (CYL): cantidad de astigmatismo. Eje (AXIS): orientacion del astigmatismo (0-180°). Adicion (ADD): poder extra para cerca (progresivos/bifocales). Distancia interpupilar (DIP/PD): separacion entre pupilas."
    },
    {
      keywords: ["antiniebla", "anti niebla", "anti fog", "antivaho", "empanamiento"],
      title: "Tratamiento Antiniebla (Anti-Fog)",
      content: "Los lentes con tratamiento anti-fog evitan el empanamiento por cambios de temperatura. Ideal para mascarillas, deportes, clima frio. Marcas: OptiPlus Anti-Fog, Zeiss Anti-Fog. Tambien existen sprays y toallitas anti-fog para aplicar sobre lentes existentes."
    },
    {
      keywords: ["lentes inteligentes", "smart glasses", "realidad aumentada", "tecnologia"],
      title: "Gafas Inteligentes y Realidad Aumentada",
      content: "Ultimas innovaciones: Ray-Ban Meta (camara, audio, IA), Xreal Air (AR portatil), Apple Vision Pro (computacion espacial). Lentes con pantalla integrada para navegacion, traduccion y notificaciones. La tecnologia de guia de onda (waveguide) permite superponer informacion digital sin obstruir la vision."
    },
    {
      keywords: ["impresion 3d", "3d", "montura impresa", "personalizada"],
      title: "Monturas Impresas en 3D",
      content: "La impresion 3D permite monturas personalizadas segun la topografia facial del usuario. Materiales: nylon (poliamida), resina. Ventajas: ajuste perfecto, disenos imposibles con metodos tradicionales, produccion bajo demanda. Marcas: Monoqool, YouMawo, Hoet."
    },
    {
      keywords: ["lentes organicos", "sustentable", "ecologico", "eco friendly", "bambu"],
      title: "Lentes y Monturas Ecologicas",
      content: "Monturas biodegradables: acetato natural (Mazzucchelli), bambu, madera reciclada, plastico oceánico reciclado. Lentes organicos: materiales bio-based. Marcas sustentables: Eco Eyewear, Proof, Sea2See. Packaging reciclable y procesos de produccion carbono neutral."
    },
    {
      keywords: ["lentes niños", "montura infantil", "flexible", "seguridad infantil"],
      title: "Monturas Infantiles",
      content: "Caracteristicas: material flexible (memoria), varillas ajustables, sin piezas metalicas pequeñas, puente nasal adaptado a rostros infantiles. Marcas: Ray-Ban Junior, Nike Kids, Flexi Kids. Recomendacion: lentes de policarbonato por resistencia a impactos y liviandad."
    },
    {
      keywords: ["intolerancia", "alergia", "alergico", "niquel", "piel sensible"],
      title: "Lentes para Piel Sensible (Hipoalergenicos)",
      content: "Monturas hipoalergenicas: titanio (puro o beta), acetato, acero inoxidable quirurgico, plastica flexon (memoria). Evitar niquel, cobalto y cromo. Tratamiento antialergico disponible en algunas monturas."
    },
    {
      keywords: ["cita", "agendar", "reservar", "programar", "revision", "examen visual", "consulta"],
      title: "Agendar una Cita",
      content: "Puedes solicitar una cita directamente desde la seccion de Citas en el menu lateral. Selecciona una fecha y describe el motivo de tu visita (examen visual, ajuste de montura, seguimiento de lentes de contacto, etc.). Recibiras confirmacion por parte del equipo de Servicios Opticos Profesionales."
    },
    {
      keywords: ["cancelar cita", "reprogramar", "modificar cita", "cambio fecha"],
      title: "Cancelar o Reprogramar una Cita",
      content: "Si necesitas cancelar o reprogramar tu cita, contactanos por WhatsApp al +507 6682-7364 o visita la optica directamente. Te recomendamos hacer cambios con al menos 24 horas de anticipacion."
    },
    {
      keywords: ["que necesito para una cita", "requisitos cita", "preparacion", "que llevar"],
      title: "Preparacion para una Cita",
      content: "Para tu cita de examen visual: trae tus lentes actuales (si usas), tu cedula o documento de identidad, lista de medicamentos que tomas (si aplica), y cualquier receta o formula anterior. Si usas lentes de contacto, usalos el dia de la cita para que el optometra pueda evaluar su ajuste."
    },
  ], []);

  const handleAISearch = useCallback((query: string) => {
    setAiLoading(true);
    setAiError("");
    setAiResult("");
    const q = query.toLowerCase().trim();
    const words = q.split(/\s+/);
    const scored = knowledgeBase.map(entry => {
      let score = 0;
      for (const word of words) {
        for (const kw of entry.keywords) {
          if (kw.includes(word) || word.includes(kw)) score += 3;
          if (entry.content.toLowerCase().includes(word)) score += 1;
        }
      }
      return { ...entry, score };
    });
    const best = scored.filter(e => e.score > 0).sort((a, b) => b.score - a.score);
    if (best.length > 0) {
      setAiResult(best.slice(0, 3).map(e => `**${e.title}**\n${e.content}`).join("\n\n---\n\n"));
    } else {
      setAiResult("No encontre informacion sobre esa consulta en mi base de conocimiento. Temas disponibles: tipos de lentes (progresivos, bifocales, monofocales), materiales (policarbonato, alto indice, Trivex), tratamientos (antireflejo, fotocromatico, polarizado, luz azul), monturas (acetato, titanio), marcas, lentes de contacto, control de miopia, gafas de sol, tecnologia optica y mas.");
    }
    setAiLoading(false);
  }, [knowledgeBase]);

  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryCategory, setInventoryCategory] = useState("Todas");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState(invoices[0]?.id ?? "");
  const [invoiceCustomerId, setInvoiceCustomerId] = useState(customers[0]?.id ?? "CLI-001");
  const [invoiceItemId, setInvoiceItemId] = useState(inventory[0]?.id ?? "INV-001");
  const [invoiceCustomerName, setInvoiceCustomerName] = useState(customers[0]?.name ?? "");
  const [invoiceCustomerDoc, setInvoiceCustomerDoc] = useState("");
  const [invoiceCustomerPhone, setInvoiceCustomerPhone] = useState("");
  const [invoiceCustomerAddress, setInvoiceCustomerAddress] = useState("");
  const [invoiceQty, setInvoiceQty] = useState("");
  const [invoicePayment, setInvoicePayment] = useState("Efectivo");
  const [applyItbms, setApplyItbms] = useState(true);
  const [draftLines, setDraftLines] = useState<InvoiceLine[]>([]);
  const [appointmentForm, setAppointmentForm] = useState({ date: "2026-06-21", time: "10:00", reason: "Examen visual" });
  const [newInventoryItem, setNewInventoryItem] = useState({ name: "", category: "", model: "", sku: "", stock: "", minStock: "", cost: "", price: "", supplier: "", location: "" });
  const [purchaseForm, setPurchaseForm] = useState({ supplier: "", ruc: "", dv: "" });
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);
  const [purchaseLineForm, setPurchaseLineForm] = useState({ description: "", qty: "", unitPrice: "0", barcode: "" });
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [purchaseQuery, setPurchaseQuery] = useState("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState("Todas");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [serviceForm, setServiceForm] = useState({ service: "", provider: "", category: "Servicios publicos" as ServiceCategory, dueDate: "2026-06-30", amount: "0" });
  const [customerForm, setCustomerForm] = useState({ name: "", document: "", dv: "", email: "", phone: "", address: "", prescription: "" });
  const [salesPeriod, setSalesPeriod] = useState<"dia" | "semana" | "mes">("dia");
  const [techFilter, setTechFilter] = useState("Todos");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inventoryFormRef = useRef<HTMLFormElement | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("Abre la camara y apunta al codigo de barras o QR del producto.");
  const [detectedSku, setDetectedSku] = useState("");

  useEffect(() => {
    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(() => undefined);
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(() => undefined);
      const swUrl = `/sw.js?v=${Date.now()}`;
      navigator.serviceWorker.register(swUrl).catch(() => undefined);
    }
  }, []);

  // Sync: load data from Supabase on mount (replaces localStorage if available)
  useEffect(() => {
    let cancelled = false;
    loadAllSeedData().then((data) => {
      if (cancelled) return;
      if (data.inventory.length > 0) setInventory(data.inventory);
      if (data.purchases.length > 0) {
        const migrated = data.purchases.map((p: any) => {
          if (!p.lines && typeof p.items === "number") {
            const unitPrice = p.items > 0 ? Math.round(p.subtotal / p.items * 100) / 100 : 0;
            return { ...p, lines: [{ description: "Producto", qty: p.items, unitPrice, barcode: "" }] };
          }
          return p;
        });
        setPurchases(migrated);
      }
      if (data.servicePayments.length > 0) setServicePayments(data.servicePayments);
      if (data.customers.length > 0) setCustomers(data.customers);
      if (data.invoices.length > 0) setInvoices(data.invoices);
      if (data.appointments.length > 0) setAppointments(data.appointments);
      if (data.users.length > 0) setUsers(data.users);
    });
    return () => { cancelled = true; };
  }, []);

  // Sync: save to Supabase when data changes (debounced by next tick)
  useEffect(() => { const t = setTimeout(() => saveInventory(inventory), 0); return () => clearTimeout(t); }, [inventory]);
  useEffect(() => { const t = setTimeout(() => savePurchases(purchases), 0); return () => clearTimeout(t); }, [purchases]);
  useEffect(() => { const t = setTimeout(() => saveServicePayments(servicePayments), 0); return () => clearTimeout(t); }, [servicePayments]);
  useEffect(() => { const t = setTimeout(() => saveCustomers(customers), 0); return () => clearTimeout(t); }, [customers]);
  useEffect(() => { const t = setTimeout(() => saveInvoices(invoices), 0); return () => clearTimeout(t); }, [invoices]);
  useEffect(() => { const t = setTimeout(() => saveAppointments(appointments), 0); return () => clearTimeout(t); }, [appointments]);
  useEffect(() => { const t = setTimeout(() => saveUserAccounts(users), 0); return () => clearTimeout(t); }, [users]);

  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); }, [darkMode]);

  const startScanner = useCallback(async () => {
    setScannerStatus("Solicitando permiso de camara...");

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerStatus("Este navegador no permite abrir la camara. Ingresa el codigo manualmente.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setScannerOpen(true);
    } catch {
      setScannerStatus("No se pudo abrir la camara. Revisa permisos o usa HTTPS y registra el SKU manualmente.");
    }
  }, []);

  const streamAttachedRef = useRef(false);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      streamAttachedRef.current = false;
      return;
    }

    if (!videoRef.current || !streamRef.current || streamAttachedRef.current) return;

    const video = videoRef.current;
    const stream = streamRef.current;
    video.srcObject = stream;
    video.play();
    streamAttachedRef.current = true;

    if (!window.BarcodeDetector) {
      setScannerStatus("Camara activa. Tu navegador no soporta lectura automatica; escribe el codigo en el campo SKU.");
      return;
    }

    const detector = new window.BarcodeDetector();
    setScannerStatus("Camara activa. Apunta al codigo de barras o QR del producto.");
    scanBarcodeFrame(detector);
  });

  useEffect(() => {
    const adminViews = adminNav.map((item) => item.id);
    const clientViews = clientNav.map((item) => item.id);

    if (isAdminRole(displayRole) && !adminViews.includes(activeView as AdminView)) {
      setActiveView("panel");
    }

    if (displayRole === "Cliente" && !clientViews.includes(activeView as ClientView)) {
      setActiveView("portal");
    }
  }, [activeView, role, setActiveView]);

  useEffect(() => {
    if (!customers.some((customer) => customer.id === invoiceCustomerId) && customers[0]) {
      setInvoiceCustomerId(customers[0].id);
    }

    if (activeClientId && !customers.some((customer) => customer.id === activeClientId) && customers[0]) {
      setActiveClientId(customers[0].id);
    }
  }, [activeClientId, customers, invoiceCustomerId]);

  useEffect(() => {
    if (!inventory.some((item) => item.id === invoiceItemId) && inventory[0]) {
      setInvoiceItemId(inventory[0].id);
    }
  }, [inventory, invoiceItemId]);

  useEffect(() => {
    if (!invoices.some((invoice) => invoice.id === activeInvoiceId) && invoices[0]) {
      setActiveInvoiceId(invoices[0].id);
    }
  }, [activeInvoiceId, invoices]);

  useEffect(() => {
    if (sessionUser && !activeClientId) {
      const match = customers.find((c) => c.email === sessionUser);
      if (match) setActiveClientId(match.id);
    }
  }, [sessionUser, customers, activeClientId]);

  const visibleInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesCategory = inventoryCategory === "Todas" || item.category === inventoryCategory;
      const term = inventoryQuery.trim().toLowerCase();
      const matchesTerm = !term || `${item.name} ${item.sku} ${item.supplier}`.toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [inventory, inventoryCategory, inventoryQuery]);

  const lowStockItems = useMemo(() => inventory.filter((item) => item.status !== "Servicio" && item.stock <= item.minStock), [inventory]);
  const activeClient = customers.find((customer) => customer.id === activeClientId) ?? null;
  const selectedCustomer = customers.find((customer) => customer.id === invoiceCustomerId) ?? null;
  const selectedInvoice = invoices.find((invoice) => invoice.id === activeInvoiceId) ?? invoices[0];
  const clientInvoices = useMemo(() => invoices.filter((invoice) => invoice.customerId === activeClient?.id), [activeClient?.id, invoices]);
  const clientAppointments = useMemo(() => appointments.filter((appointment) => appointment.customerId === activeClient?.id), [activeClient?.id, appointments]);
  const draftTotals = useMemo(() => invoiceTotals(draftLines), [draftLines]);
  const selectedInvoiceTotals = selectedInvoice ? invoiceTotals(selectedInvoice.lines) : { subtotal: 0, tax: 0, total: 0 };
  const visiblePurchases = useMemo(() => {
    return purchases.filter((p) => {
      const matchesStatus = purchaseStatusFilter === "Todas" || p.status === purchaseStatusFilter;
      const term = purchaseQuery.trim().toLowerCase();
      const matchesTerm = !term || `${p.supplier} ${p.ruc} ${p.id}`.toLowerCase().includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [purchases, purchaseQuery, purchaseStatusFilter]);
  const visibleInvoices = useMemo(() => {
    const term = invoiceQuery.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter((inv) => `${inv.id} ${inv.customer} ${inv.document}`.toLowerCase().includes(term));
  }, [invoices, invoiceQuery]);
  const inventoryValue = inventory.reduce((sum, item) => (item.status === "Servicio" ? sum : sum + item.stock * item.cost), 0);
  const salesTax = invoices.reduce((sum, invoice) => (invoice.status === "Borrador" ? sum : sum + invoiceTotals(invoice.lines).tax), 0);
  const purchaseTax = purchases.reduce((sum, purchase) => (purchase.status === "Pendiente" ? sum : sum + purchase.tax), 0);
  const salesTotal = invoices.reduce((sum, invoice) => (invoice.status === "Borrador" ? sum : sum + invoiceTotals(invoice.lines).total), 0);

  const completedInvoices = useMemo(() => invoices.filter((inv) => inv.status !== "Borrador"), [invoices]);

  const salesChartData = useMemo(() => {
    const groups: Record<string, number> = {};
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const formatMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const formatWeek = (d: Date) => {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
    };
    completedInvoices.forEach((inv) => {
      const d = new Date(inv.date + "T00:00:00");
      let key: string;
      if (salesPeriod === "dia") key = inv.date;
      else if (salesPeriod === "semana") {
        if (d < startOfWeek) return;
        key = formatWeek(d);
      } else {
        key = formatMonth(d);
      }
      groups[key] = (groups[key] || 0) + invoiceTotals(inv.lines).total;
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }));
  }, [completedInvoices, salesPeriod]);
  const pendingServices = servicePayments.filter((payment) => payment.status !== "Pagado");
  const pendingCustomerBalance = customers.reduce((sum, customer) => sum + customer.balance, 0);
  const serviceExpenses = servicePayments.reduce((sum, p) => sum + p.amount, 0);
  const purchaseExpenses = purchases.reduce((sum, p) => sum + p.total, 0);
  const totalExpenses = serviceExpenses + purchaseExpenses;
  const netIncome = salesTotal - totalExpenses;
  const displayRole: Role = isMobile ? "Cliente" : role;
  const currentNav = isAdminRole(displayRole) ? adminNav : clientNav;

  const generateExamPDF = useCallback((exam: ExamResult) => {
    const customer = customers.find(c => c.id === exam.customerId);
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const margin = 20;
    const y0 = 25;
    const col1 = margin;
    const col2 = 105;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(business.name, pageW / 2, y0, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(business.address, pageW / 2, y0 + 6, { align: "center" });
    pdf.text(`Cel: ${business.celular} / Fijo: ${business.fijo}`, pageW / 2, y0 + 12, { align: "center" });

    let y = y0 + 22;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageW - margin, y);
    y += 8;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Resultado de Examen Visual", margin, y);
    y += 10;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Examen: ${exam.id}`, margin, y);
    pdf.text(`Fecha: ${new Date(exam.date).toLocaleDateString("es-PA", { year: "numeric", month: "long", day: "numeric" })}`, col2, y);
    y += 7;

    if (customer) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Paciente:", margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(customer.name, margin + 22, y);
      pdf.setFont("helvetica", "bold");
      pdf.text("Documento:", col2, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${customer.document} DV ${customer.dv}`, col2 + 22, y);
      y += 7;
      pdf.text(`Email: ${customer.email}`, margin, y);
      pdf.text(`Telefono: ${customer.phone}`, col2, y);
    }
    y += 12;

    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageW - margin, y);
    y += 6;

    const rxW = (pageW - 2 * margin) / 2;
    const tableX = [margin, margin + rxW / 2, margin + rxW];
    const colW = [rxW * 0.35, rxW * 0.25, rxW * 0.25];

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Formula Optica", margin, y);
    y += 5;

    const drawRow = (label: string, od: string, oi: string, bold = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.text(label, tableX[0], y);
      pdf.setFont("helvetica", "bold");
      pdf.text("OD", margin + rxW * 0.55, y);
      pdf.text("OI", pageW - rxW * 0.25, y);
      pdf.setFont("helvetica", "normal");
      y += 2;
      pdf.setDrawColor(230, 230, 230);
      pdf.line(margin + rxW, y, pageW - margin, y);
      y += 1;
      pdf.text(od, margin + rxW * 0.55, y);
      pdf.text(oi, pageW - rxW * 0.25, y);
      y += 6;
    };

    y += 2;
    const frx = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
    drawRow("Esfera (SPH)", frx(exam.odSphere), frx(exam.oiSphere));
    drawRow("Cilindro (CYL)", frx(exam.odCylinder), frx(exam.oiCylinder));
    drawRow(`Eje (AXIS)`, `${exam.odAxis}°`, `${exam.oiAxis}°`);

    pdf.setFont("helvetica", "normal");
    pdf.text(`Adicion (ADD): ${exam.add.toFixed(2)}`, margin, y);
    pdf.text(`DIP: ${exam.dip} mm`, col2, y);
    y += 8;

    pdf.text(`Requiere lentes: ${exam.needsLenses ? "Si" : "No"}`, margin, y);
    if (exam.needsLenses) pdf.text(`Tipo recomendado: ${exam.lensType}`, col2, y);
    y += 8;

    if (exam.notes) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Observaciones:", margin, y);
      y += 5;
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(exam.notes, pageW - 2 * margin);
      pdf.text(lines, margin, y);
      y += lines.length * 4 + 4;
    }

    y = Math.max(y, 250);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageW - margin, y);
    y += 5;
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "italic");
    pdf.text(`${business.name} · ${business.address} · Cel ${business.celular} / Fijo ${business.fijo}`, pageW / 2, y, { align: "center" });
    pdf.text(business.hours, pageW / 2, y + 4, { align: "center" });

    pdf.save(`examen-visual-${exam.id}.pdf`);
  }, [customers]);

  async function registerAuthUser(email: string, password: string, registerRole: Role = "Super Admin") {
    const error = validateAuthCredentials(email, password);

    if (error) {
      return error;
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { error: signUpError } = await supabase.auth.signUp({ email: normalizedEmail, password });
      if (signUpError && !signUpError.message.includes("already") && !signUpError.message.includes("anon") && !signUpError.message.includes("Invalid API key")) {
        return `Error al crear usuario: ${signUpError.message}`;
      }
    } catch {
      // Offline: continue with local auth
    }

    const nextUser = { email: normalizedEmail, password, createdAt: todayDate() };
    console.log("registerAuthUser: setting state", nextUser.email);
    setRegisteredUser(nextUser);
    setSessionUser(nextUser.email);
    setRole(registerRole);
    setActiveView(isAdminRole(registerRole) ? "panel" : "portal");

    if (registerRole === "Cliente") {
      const name = normalizedEmail.split("@")[0].replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim() || "Cliente nuevo";
      setCustomers((items) => [{ id: `CLI-${String(items.length + 1).padStart(3, "0")}`, name, document: "", dv: "00", email: normalizedEmail, phone: "", address: "", prescription: "Pendiente de examen.", lastVisit: todayDate(), balance: 0, status: "Activo" }, ...items]);
    }
    sendRegistrationEmail(nextUser.email);
    return "";
  }

  async function loginAuthUser(email: string, password: string) {
    if (!registeredUser) {
      return "Primero debes registrar el usuario inicial.";
    }

    if (registeredUser.email !== email.trim().toLowerCase() || registeredUser.password !== password) {
      return "Correo o contrasena incorrectos.";
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    } catch {
      // Offline: continue with local auth
    }

    setSessionUser(registeredUser.email);
    return "";
  }

  function stopScanner() {
    if (scanFrameRef.current !== null) {
      window.cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function scanBarcodeFrame(detector: BarcodeDetectorInstance) {
    const scan = async () => {
      if (!videoRef.current) {
        return;
      }

      try {
        const results = await detector.detect(videoRef.current);
        const code = results[0]?.rawValue?.trim();

        if (code) {
          setDetectedSku(code);
          const existing = inventory.find((item) => item.sku.toLowerCase() === code.toLowerCase());
          if (existing) {
            setScannerStatus(`Producto existente: ${existing.name} (SKU: ${code}). Se agregaran unidades al stock actual (${existing.stock}).`);
            setNewInventoryItem((form) => ({ ...form, sku: code, name: existing.name, stock: "1", cost: String(existing.cost), price: String(existing.price), category: existing.category, supplier: existing.supplier, location: existing.location }));
          } else {
            setNewInventoryItem((form) => ({ ...form, sku: code, name: form.name || `Producto ${code.slice(-6)}` }));
            setScannerStatus(`Codigo detectado: ${code}. Completa los datos y registra el producto.`);
          }
          stopScanner();
          return;
        }
      } catch {
        setScannerStatus("Buscando codigo. Si no se lee, ingresa el SKU manualmente.");
      }

      scanFrameRef.current = window.requestAnimationFrame(scan);
    };

    scanFrameRef.current = window.requestAnimationFrame(scan);
  }

  function restartScanner() {
    stopScanner();
    setDetectedSku("");
    setScannerStatus("Reiniciando camara...");
    setScannerOpen(false);
    window.setTimeout(() => startScanner(), 80);
  }



  function switchRole(nextRole: Role) {
    setRole(nextRole);
    setActiveView(isAdminRole(nextRole) ? "panel" : "portal");
  }


  function updateStock(id: string, delta: number) {
    setInventory((items) =>
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const nextStock = Math.max(0, item.stock + delta);
        return {
          ...item,
          stock: nextStock,
          status: item.status === "Servicio" ? "Servicio" : nextStock <= item.minStock ? "Bajo stock" : "Activo",
        };
      }),
    );
  }

  function generateSkuFromName(name: string): string {
    if (!name.trim()) return "";
    const prefix = name.trim().substring(0, 3).toUpperCase();
    const num = Date.now().toString(36).slice(-4).toUpperCase();
    return `${prefix}-${num}`;
  }

  function deleteInventoryItem(id: string) {
    if (!confirm("Eliminar este producto del inventario?")) return;
    setInventory((items) => items.filter((item) => item.id !== id));
  }

  function startEditInventoryItem(item: InventoryItem) {
    setEditingProductId(item.id);
    setNewInventoryItem({
      name: item.name,
      category: item.category,
      model: item.model,
      sku: item.sku,
      stock: String(item.stock),
      minStock: String(item.minStock),
      cost: String(item.cost),
      price: String(item.price),
      supplier: item.supplier,
      location: item.location,
    });
  }

  function cancelEditInventoryItem() {
    setEditingProductId(null);
    setNewInventoryItem({ name: "", category: "", model: "", sku: "", stock: "", minStock: "", cost: "", price: "", supplier: "", location: "" });
  }

  function removeCategory(cat: string) {
    if (!confirm(`Eliminar la categoria "${cat}"? Los productos pasaran a "General".`)) return;
    setInventory((items) =>
      items.map((item) => (item.category === cat ? { ...item, category: "General" } : item)),
    );
  }

  function removeModel(mod: string) {
    if (!confirm(`Eliminar el modelo "${mod}"? Los productos quedaran sin modelo.`)) return;
    setInventory((items) =>
      items.map((item) => (item.model === mod ? { ...item, model: "" } : item)),
    );
  }

  function addInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sku = newInventoryItem.sku.trim();
    const stock = Number(newInventoryItem.stock) || 0;
    const minStock = Number(newInventoryItem.minStock) || 0;
    const price = Number(newInventoryItem.price);
    const cost = Number(newInventoryItem.cost) || Math.round(price * 0.45 * 100) / 100;
    const existingItem = sku ? inventory.find((item) => item.sku.toLowerCase() === sku.toLowerCase()) : undefined;

    if (!sku || Number.isNaN(price) || !newInventoryItem.name.trim()) {
      return;
    }

    const category = newInventoryItem.category.trim() || "General";
    const model = newInventoryItem.model.trim();
    const supplier = newInventoryItem.supplier.trim() || "Proveedor por asignar";
    const location = newInventoryItem.location.trim() || "Deposito";

    if (editingProductId) {
      setInventory((items) =>
        items.map((item) => {
          if (item.id !== editingProductId) return item;
          const nextStock = item.status === "Servicio" ? item.stock : stock;
          return {
            ...item,
            sku,
            name: newInventoryItem.name.trim(),
            category,
            model,
            supplier,
            stock: nextStock,
            minStock,
            cost,
            price,
            location,
            status: item.status === "Servicio" ? "Servicio" : nextStock <= minStock ? "Bajo stock" : "Activo",
          };
        }),
      );
      setEditingProductId(null);
    } else if (existingItem) {
      setInventory((items) =>
        items.map((item) => {
          if (item.id !== existingItem.id) return item;
          const nextStock = item.stock + stock;
          return { ...item, stock: nextStock, status: item.status === "Servicio" ? "Servicio" : nextStock <= item.minStock ? "Bajo stock" : "Activo" };
        }),
      );
    } else {
      const nextId = `INV-${String(inventory.length + 1).padStart(3, "0")}`;
      const isService = category.toLowerCase().includes("servicio");
      setInventory((items) => [
        ...items,
        {
          id: nextId,
          sku,
          name: newInventoryItem.name.trim(),
          category,
          model,
          supplier,
          stock,
          minStock,
          cost,
          price,
          taxRate: isService ? 0 : PANAMA_TAX_RATE,
          location,
          status: isService ? "Servicio" : stock <= minStock ? "Bajo stock" : "Activo",
        },
      ]);
    }

    setInventoryQuery(sku);
    setNewInventoryItem({ name: "", category: "", model: "", sku: "", stock: "", minStock: "", cost: "", price: "", supplier: "", location: "" });
    setTimeout(() => inventoryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function addInvoiceLine() {
    const item = inventory.find((inventoryItem) => inventoryItem.id === invoiceItemId);
    const qty = Number(invoiceQty);

    if (!item) return;

    setDraftLines((lines) => [
      ...lines,
      {
        itemId: item.id,
        description: item.name,
        qty: qty || 1,
        unitPrice: item.price,
        taxRate: applyItbms ? item.taxRate : 0,
      },
    ]);
    setInvoiceQty("");
  }

  function removeInvoiceLine(index: number) {
    setDraftLines((lines) => lines.filter((_, lineIndex) => lineIndex !== index));
  }

  function saveInvoiceCustomer() {
    const name = invoiceCustomerName.trim();
    if (!name || customers.some((c) => c.name === name)) {
      return;
    }
    const newCustomer: Customer = {
      id: `CLI-${String(customers.length + 1).padStart(3, "0")}`,
      name,
      document: invoiceCustomerDoc.trim() || "Consumidor final",
      dv: "00",
      email: "cliente@example.com",
      phone: invoiceCustomerPhone.trim() || "+507",
      address: invoiceCustomerAddress.trim() || "",
      prescription: "Formula pendiente de registrar",
      lastVisit: todayDate(),
      balance: 0,
    };
    setCustomers((items) => [newCustomer, ...items]);
    setUsers((items) => [
      ...items,
      { id: `USR-${String(items.length + 1).padStart(3, "0")}`, name: newCustomer.name, role: "Cliente", email: newCustomer.email, status: "Activo" },
    ]);
    setInvoiceCustomerId(newCustomer.id);
    setInvoiceCustomerDoc("");
    setInvoiceCustomerPhone("");
    setInvoiceCustomerAddress("");
  }

  function issueInvoice() {
    if (!invoiceCustomerName.trim() || draftLines.length === 0) {
      return;
    }

    const existing = invoiceCustomerId ? customers.find((c) => c.id === invoiceCustomerId) : customers.find((c) => c.name === invoiceCustomerName.trim());
    let billTo = existing;

    if (!billTo) {
      const newCustomer: Customer = {
        id: `CLI-${String(customers.length + 1).padStart(3, "0")}`,
        name: invoiceCustomerName.trim(),
        document: invoiceCustomerDoc.trim() || "Consumidor final",
        dv: "00",
        email: "cliente@example.com",
        phone: invoiceCustomerPhone.trim() || "+507",
        address: invoiceCustomerAddress.trim() || "",
        prescription: "Formula pendiente de registrar",
        lastVisit: todayDate(),
        balance: 0,
      };
      setCustomers((items) => [newCustomer, ...items]);
      setUsers((items) => [
        ...items,
        { id: `USR-${String(items.length + 1).padStart(3, "0")}`, name: newCustomer.name, role: "Cliente", email: newCustomer.email, status: "Activo" },
      ]);
      billTo = newCustomer;
    }

    const nextNumber = invoices.length + 1;
    const id = `FE-${String(nextNumber).padStart(5, "0")}`;
    const newInvoice: Invoice = {
      id,
      customerId: billTo.id,
      customer: billTo.name,
      document: billTo.document || "Consumidor final",
      dv: billTo.dv || "00",
      date: todayDate(),
      status: invoicePayment === "Credito" ? "Emitida" : "Pagada",
      payment: invoicePayment,
      cufe: generateCufe(nextNumber),
      cafe: `CAFE-${String(nextNumber).padStart(5, "0")}-SOP`,
      lines: draftLines,
    };

    setInvoices((items) => [newInvoice, ...items]);
    setInventory((items) =>
      items.map((item) => {
        const soldQty = draftLines.filter((line) => line.itemId === item.id).reduce((sum, line) => sum + line.qty, 0);
        if (soldQty === 0 || item.status === "Servicio") {
          return item;
        }

        const nextStock = Math.max(0, item.stock - soldQty);
        return { ...item, stock: nextStock, status: nextStock <= item.minStock ? "Bajo stock" : "Activo" };
      }),
    );
    setCustomers((items) =>
      items.map((customer) => (customer.id === billTo.id ? { ...customer, balance: invoicePayment === "Credito" ? customer.balance + draftTotals.total : customer.balance } : customer)),
    );
    setDraftLines([]);
    setActiveInvoiceId(id);
    setInvoiceCustomerId("");
    setTimeout(() => window.print(), 500);
    setInvoiceCustomerName("");
    setInvoiceCustomerDoc("");
    setInvoiceCustomerPhone("");
    setInvoiceCustomerAddress("");
  }

  function markInvoicePaid(id: string) {
    setInvoices((items) => items.map((invoice) => (invoice.id === id ? { ...invoice, status: "Pagada" } : invoice)));
  }

  function generateBarcode(): string {
    const used = new Set(purchaseLines.map((l) => l.barcode).filter(Boolean));
    const invUsed = new Set(inventory.map((i) => i.sku).filter(Boolean));
    for (let attempt = 0; attempt < 100; attempt++) {
      const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
      const code = `750${digits}`;
      if (!used.has(code) && !invUsed.has(code)) return code;
    }
    return `BRC-${Date.now().toString(36).toUpperCase()}`;
  }

  function addPurchaseLine() {
    const description = purchaseLineForm.description.trim();
    const qty = Number(purchaseLineForm.qty) || 1;
    const unitPrice = Number(purchaseLineForm.unitPrice);
    const manualBarcode = purchaseLineForm.barcode?.trim() || "";
    if (!description || Number.isNaN(unitPrice) || unitPrice < 0) return;
    const invMatch = manualBarcode
      ? inventory.find((i) => i.sku.toLowerCase() === manualBarcode.toLowerCase())
      : inventory.find((i) => i.name.toLowerCase().includes(description.toLowerCase()));
    const barcode = invMatch?.sku ?? (manualBarcode || "");
    setPurchaseLines((prev) => [...prev, { description, qty, unitPrice, barcode }]);
    setPurchaseLineForm({ description: "", qty: "", unitPrice: "0", barcode: "" });
  }

  function removePurchaseLine(index: number) {
    setPurchaseLines((prev) => prev.filter((_, i) => i !== index));
  }

  function addPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purchaseForm.supplier.trim() || purchaseLines.length === 0) return;

    const subtotal = purchaseLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
    const tax = subtotal * PANAMA_TAX_RATE;

    if (editingPurchaseId) {
      setPurchases((orders) =>
        orders.map((order) =>
          order.id === editingPurchaseId
            ? { ...order, supplier: purchaseForm.supplier.trim(), ruc: purchaseForm.ruc || "Proveedor sin RUC", dv: purchaseForm.dv || "00", lines: [...purchaseLines], subtotal, tax, total: subtotal + tax }
            : order
        )
      );
      setEditingPurchaseId(null);
    } else {
      setPurchases((orders) => [
        {
          id: `OC-${String(orders.length + 11).padStart(4, "0")}`,
          supplier: purchaseForm.supplier.trim(),
          ruc: purchaseForm.ruc || "Proveedor sin RUC",
          dv: purchaseForm.dv || "00",
          date: todayDate(),
          status: "Pendiente",
          lines: [...purchaseLines],
          subtotal,
          tax,
          total: subtotal + tax,
        },
        ...orders,
      ]);
    }
    setPurchaseForm({ supplier: "", ruc: "", dv: "" });
    setPurchaseLines([]);
    setPurchaseLineForm({ description: "", qty: "", unitPrice: "0" });
  }

  function updatePurchaseStatus(id: string, status: PurchaseOrder["status"]) {
    setPurchases((orders) => orders.map((order) => (order.id === id ? { ...order, status } : order)));
  }

  function deletePurchase(id: string) {
    if (!window.confirm("Eliminar esta orden de compra?")) return;
    setPurchases((orders) => orders.filter((order) => order.id !== id));
  }

  function startEditPurchase(purchase: PurchaseOrder) {
    setEditingPurchaseId(purchase.id);
    setPurchaseForm({ supplier: purchase.supplier, ruc: purchase.ruc, dv: purchase.dv });
    setPurchaseLines([...purchase.lines]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditPurchase() {
    setEditingPurchaseId(null);
    setPurchaseForm({ supplier: "", ruc: "", dv: "" });
    setPurchaseLines([]);
    setPurchaseLineForm({ description: "", qty: "", unitPrice: "0", barcode: "" });
  }

  function addServicePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(serviceForm.amount);

    if (!serviceForm.service.trim() || !serviceForm.provider.trim() || Number.isNaN(amount)) {
      return;
    }

    setServicePayments((payments) => [
      {
        id: `PS-${String(payments.length + 1).padStart(3, "0")}`,
        service: serviceForm.service.trim(),
        provider: serviceForm.provider.trim(),
        category: serviceForm.category,
        dueDate: serviceForm.dueDate,
        amount,
        status: "Pendiente",
        method: "Por definir",
      },
      ...payments,
    ]);
    setServiceForm({ service: "", provider: "", category: "Servicios publicos" as ServiceCategory, dueDate: "2026-06-30", amount: "0" });
  }

  function markServicePaid(id: string) {
    setServicePayments((payments) => payments.map((payment) => (payment.id === id ? { ...payment, status: "Pagado" } : payment)));
  }

  function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!customerForm.name.trim()) {
      return;
    }

    const nextCustomer: Customer = {
      id: `CLI-${String(customers.length + 1).padStart(3, "0")}`,
      name: customerForm.name.trim(),
      document: customerForm.document || "Consumidor final",
      dv: customerForm.dv || "00",
      email: customerForm.email || "cliente@example.com",
      phone: customerForm.phone || "+507",
      address: customerForm.address || "",
      prescription: customerForm.prescription || "Formula pendiente de registrar",
      lastVisit: todayDate(),
      balance: 0,
    };

    setCustomers((items) => [nextCustomer, ...items]);
    setUsers((items) => [
      ...items,
      { id: `USR-${String(items.length + 1).padStart(3, "0")}`, name: nextCustomer.name, role: "Cliente", email: nextCustomer.email, status: "Activo" },
    ]);
    setCustomerForm({ name: "", document: "", dv: "", email: "", phone: "", address: "", prescription: "" });
  }

  async function clearAllData() {
    if (!window.confirm("Eliminar compras, facturas, clientes, pagos y citas? El inventario no se borrara. Esta accion no se puede deshacer.")) return;
    setPurchases([]);
    setInvoices([]);
    setCustomers([]);
    setServicePayments([]);
    setAppointments([]);
    setUsers([]);
    setExamResults([]);
    localStorage.setItem("sop-purchases", JSON.stringify([]));
    localStorage.setItem("sop-invoices", JSON.stringify([]));
    localStorage.setItem("sop-customers", JSON.stringify([]));
    localStorage.setItem("sop-service-payments", JSON.stringify([]));
    localStorage.setItem("sop-appointments", JSON.stringify([]));
    localStorage.setItem("sop-users", JSON.stringify([]));
    localStorage.setItem("sop-exams", JSON.stringify([]));
    try {
      await Promise.allSettled([
        supabase.from("purchase_orders").delete().neq("id", ""),
        supabase.from("invoices").delete().neq("id", ""),
        supabase.from("customers").delete().neq("id", ""),
        supabase.from("service_payments").delete().neq("id", ""),
        supabase.from("appointments").delete().neq("id", ""),
        supabase.from("user_accounts").delete().neq("id", ""),
        supabase.from("exam_results").delete().neq("id", ""),
      ]);
    } catch { /* silent */ }
  }

  function restoreFromAutoBackup() {
    const keys = ["sop-inventory", "sop-purchases", "sop-invoices", "sop-customers", "sop-service-payments", "sop-appointments", "sop-users", "sop-exams"];
    const available = keys.filter((k) => getBackups(k).length > 0);
    if (available.length === 0) return alert("No hay backups automaticos disponibles.");
    if (!window.confirm(`Restaurar datos desde el backup automatico?\n\nBackups encontrados: ${available.length}\nSe recargara la pagina para aplicar los cambios.`)) return;
    for (const key of keys) restoreFromBackup(key, 0);
    window.location.reload();
  }

  function importAllData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.inventory) setInventory(data.inventory);
        if (data.purchases) setPurchases(data.purchases);
        if (data.invoices) setInvoices(data.invoices);
        if (data.customers) setCustomers(data.customers);
        if (data.servicePayments) setServicePayments(data.servicePayments);
        if (data.appointments) setAppointments(data.appointments);
        if (data.users) setUsers(data.users);
        if (data.examResults) setExamResults(data.examResults);
        alert("Datos importados correctamente.");
      } catch { alert("Error: el archivo no es valido."); }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAllPurchasesCSV() {
    const header = "ID,Proveedor,RUC,DV,Fecha,Estado,Subtotal,ITBMS,Total";
    const rows = purchases.map((p) =>
      [p.id, p.supplier, p.ruc, p.dv, p.date, p.status, p.subtotal.toFixed(2), p.tax.toFixed(2), p.total.toFixed(2)].join(",")
    );
    downloadFile([header, ...rows].join("\n"), `compras-${todayDate()}.csv`, "text/csv;charset=utf-8;");
  }

  function exportPurchasePDF(purchase: PurchaseOrder) {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const margin = 20;
    let y = 25;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(purchase.id, pageW / 2, y, { align: "center" });
    y += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Proveedor: ${purchase.supplier}`, margin, y);
    y += 6;
    pdf.text(`RUC: ${purchase.ruc}  DV: ${purchase.dv}`, margin, y);
    y += 6;
    pdf.text(`Fecha: ${formatDate(purchase.date)}`, margin, y);
    y += 6;
    pdf.text(`Estado: ${purchase.status}`, margin, y);
    y += 10;

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageW - margin, y);
    y += 7;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    const colW = [80, 30, 30, 30];
    const cols = [margin, margin + colW[0], margin + colW[0] + colW[1], margin + colW[0] + colW[1] + colW[2]];
    pdf.text("Descripcion", cols[0], y);
    pdf.text("Cant.", cols[1], y);
    pdf.text("P. Unit.", cols[2], y);
    pdf.text("Subtotal", cols[3], y);
    y += 5;
    pdf.line(margin, y, pageW - margin, y);
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const line of purchase.lines) {
      pdf.text(line.description, cols[0], y);
      pdf.text(String(line.qty), cols[1], y);
      pdf.text(formatMoney(line.unitPrice), cols[2], y);
      pdf.text(formatMoney(line.qty * line.unitPrice), cols[3], y);
      y += 5;
    }
    y += 5;
    pdf.line(margin, y, pageW - margin, y);
    y += 7;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`Subtotal: ${formatMoney(purchase.subtotal)}`, pageW - margin, y, { align: "right" });
    y += 6;
    pdf.text(`ITBMS (7%): ${formatMoney(purchase.tax)}`, pageW - margin, y, { align: "right" });
    y += 6;
    pdf.setFontSize(12);
    pdf.text(`Total: ${formatMoney(purchase.total)}`, pageW - margin, y, { align: "right" });

    pdf.save(`${purchase.id}-${purchase.supplier}.pdf`);
  }

  function exportInvoicePDF(invoice: Invoice) {
    const totals = invoiceTotals(invoice.lines);
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const margin = 20;
    let y = 25;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(invoice.id, pageW / 2, y, { align: "center" });
    y += 8;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Cliente: ${invoice.customer}`, margin, y);
    y += 6;
    pdf.text(`Documento: ${invoice.document}`, margin, y);
    y += 6;
    pdf.text(`Fecha: ${formatDate(invoice.date)}  Pago: ${invoice.payment}`, margin, y);
    y += 6;
    pdf.text(`Estado: ${invoice.status}`, margin, y);
    y += 10;

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageW - margin, y);
    y += 7;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    const colW = [80, 20, 25, 25, 25];
    const cols = [margin, margin + colW[0], margin + colW[0] + colW[1], margin + colW[0] + colW[1] + colW[2], margin + colW[0] + colW[1] + colW[2] + colW[3]];
    pdf.text("Descripcion", cols[0], y);
    pdf.text("Cant.", cols[1], y);
    pdf.text("P. Unit.", cols[2], y);
    pdf.text("ITBMS", cols[3], y);
    pdf.text("Total", cols[4], y);
    y += 5;
    pdf.line(margin, y, pageW - margin, y);
    y += 5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const line of invoice.lines) {
      const sub = lineSubtotal(line);
      const tax = lineTax(line);
      pdf.text(line.description, cols[0], y);
      pdf.text(String(line.qty), cols[1], y);
      pdf.text(formatMoney(line.unitPrice), cols[2], y);
      pdf.text(formatMoney(tax), cols[3], y);
      pdf.text(formatMoney(sub + tax), cols[4], y);
      y += 5;
    }
    y += 5;
    pdf.line(margin, y, pageW - margin, y);
    y += 7;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`Subtotal: ${formatMoney(totals.subtotal)}`, pageW - margin, y, { align: "right" });
    y += 6;
    pdf.text(`ITBMS: ${formatMoney(totals.tax)}`, pageW - margin, y, { align: "right" });
    y += 6;
    pdf.setFontSize(12);
    pdf.text(`Total: ${formatMoney(totals.total)}`, pageW - margin, y, { align: "right" });

    pdf.save(`${invoice.id}-${invoice.customer}.pdf`);
  }

  function exportInvoicesCSV() {
    const header = "ID,Cliente,Documento,Fecha,Pago,Estado,Subtotal,ITBMS,Total";
    const rows = visibleInvoices.map((inv) => {
      const t = invoiceTotals(inv.lines);
      return [inv.id, inv.customer, inv.document, inv.date, inv.payment, inv.status, t.subtotal.toFixed(2), t.tax.toFixed(2), t.total.toFixed(2)].join(",");
    });
    downloadFile([header, ...rows].join("\n"), `facturas-${todayDate()}.csv`, "text/csv;charset=utf-8;");
  }

  function requestAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeClient || !appointmentForm.reason.trim()) {
      return;
    }

    setAppointments((items) => [
      {
        id: `CT-${String(items.length + 17).padStart(3, "0")}`,
        customerId: activeClient.id,
        date: appointmentForm.date,
        time: appointmentForm.time,
        reason: appointmentForm.reason.trim(),
        status: "Solicitada",
      },
      ...items,
    ]);
    setAppointmentForm({ date: "2026-06-21", time: "10:00", reason: "Examen visual" });
  }

  if (!sessionUser) {
    return <AuthScreen registeredUser={registeredUser} onRegister={registerAuthUser} onLogin={loginAuthUser} />;
  }

  const panelView = (
    <div className="space-y-8">
      <section className="reveal-up relative overflow-hidden rounded-[2.5rem] bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-950/20 sm:px-8 lg:px-10">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-44 w-44 rounded-full bg-emerald-300/10 blur-2xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-200">Aplicacion multiplataforma</p>
            <h2 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">{business.name}</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Operacion integral para la optica de {business.owner}: inventario, compras, pagos, facturacion a clientes, portal y control fiscal preparado para Panama.
            </p>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100">Contacto y horario</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-200">
              <p><span className="font-semibold text-white">Celular:</span> {business.celular}</p>
              <p><span className="font-semibold text-white">Fijo:</span> {business.fijo}</p>
              <p><span className="font-semibold text-white">Direccion:</span> {business.address}</p>
              <p className="mt-2 rounded-xl bg-white/10 p-3 text-center font-semibold text-white">{business.hours}</p>
            </div>
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Horario</p>
              <div className="mt-2 grid gap-1 text-sm text-slate-200">
                <p>Lunes a viernes &mdash; 8:00 am a 5:30 pm</p>
                <p>Sabado &mdash; 8:00 am a 4:00 pm</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button className="cursor-pointer rounded-2xl bg-cyan-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-cyan-600/20 transition hover:-translate-y-0.5" onClick={() => setActiveView("resultados")}>
          Examen visual
        </button>
        <button className="cursor-pointer rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5" onClick={() => setActiveView("inventario")}>
          Inventario
        </button>
      </div>

      <section className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80 backdrop-blur">
        <h3 className="text-xl font-black text-slate-950">Estado de resultados simplificado</h3>
        <p className="mt-1 text-sm text-slate-600">Resumen de ingresos, gastos y resultado neto del periodo demo.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Ingresos (ventas)</p>
            <p className="mt-3 text-2xl font-black text-emerald-900">{formatMoney(salesTotal)}</p>
            <p className="mt-2 text-sm text-emerald-700">Facturas emitidas y pagadas</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Gastos</p>
            <p className="mt-3 text-2xl font-black text-amber-900">{formatMoney(totalExpenses)}</p>
            <p className="mt-2 text-sm text-amber-700">Compras + servicios ({formatMoney(purchaseExpenses)} + {formatMoney(serviceExpenses)})</p>
          </div>
          <div className={cn("rounded-2xl p-5 ring-1", netIncome >= 0 ? "bg-cyan-50 ring-cyan-200" : "bg-rose-50 ring-rose-200")}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Resultado neto</p>
            <p className={cn("mt-3 text-2xl font-black", netIncome >= 0 ? "text-cyan-900" : "text-rose-900")}>{formatMoney(netIncome)}</p>
            <p className={cn("mt-2 text-sm", netIncome >= 0 ? "text-cyan-700" : "text-rose-700")}>{netIncome >= 0 ? "Ganancia en el periodo" : "Perdida en el periodo"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80 backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-950">Ventas por periodo</h3>
            <p className="mt-1 text-sm text-slate-600">Distribucion de ventas agrupadas por {salesPeriod === "dia" ? "dia" : salesPeriod === "semana" ? "semana" : "mes"}.</p>
          </div>
          <div className="flex gap-2 rounded-full bg-slate-100 p-1">
            {(["dia", "semana", "mes"] as const).map((period) => (
              <button key={period} className={cn("rounded-full px-4 py-2 text-sm font-black transition", salesPeriod === period ? "bg-slate-950 text-white shadow-lg" : "text-slate-600 hover:bg-slate-200")} onClick={() => setSalesPeriod(period)}>
                {period === "dia" ? "Dia" : period === "semana" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6">
          {salesChartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No hay ventas en este periodo.</p>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Grafico de ventas deshabilitado temporalmente (debugging).</p>
          )}
        </div>
      </section>
    </div>
  );

  const inventoryView = (
    <div className="space-y-8">
      <SectionTitle
        title="Inventario optico"
        subtitle="Controla monturas, lentes oftalmicos, lentes de contacto, accesorios y servicios clinicos con minimos, costos, precios e ITBMS por item."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full bg-cyan-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-600/20" onClick={startScanner}>
              Escanear con camara
            </button>
          </div>
        }
      />

      {scannerOpen && (
        <section className="reveal-up rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10">
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
                <div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-cyan-300/80" />
                <div className="scanner-line pointer-events-none absolute left-10 right-10 top-1/2 h-0.5 bg-cyan-300 shadow-[0_0_22px_rgba(103,232,249,0.9)]" />
              </div>
              <div className="mt-4 rounded-3xl bg-white/10 p-4 text-sm leading-6 text-slate-200">
                <p className="font-black text-white">{detectedSku ? `SKU detectado: ${detectedSku}` : "Escaner de mercancia"}</p>
                <p className="mt-1">{scannerStatus}</p>
                <p className="mt-2 text-xs text-slate-300">En celular usa HTTPS o localhost para habilitar la camara. Si el navegador no lee el codigo, escribe el SKU manualmente en el formulario.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950" onClick={restartScanner}>
                  Reintentar lectura
                </button>
                <button type="button" className="rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white ring-1 ring-white/15" onClick={() => setScannerOpen(false)}>
                  Cerrar camara
                </button>
              </div>
            </div>
            <div className="rounded-[1.5rem] bg-white/10 p-5 text-sm leading-6 text-slate-200">
              <p className="font-black text-white">Datos del escaneo</p>
              <p className="mt-2">{detectedSku ? `SKU: ${detectedSku} — los datos se han rellenado automaticamente en el formulario de abajo.` : "Apunta la camara a un codigo de barras o QR para auto-rellenar el formulario."}</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6">
        <form ref={inventoryFormRef} className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80 scroll-mt-6" onSubmit={addInventoryItem}>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-950">{editingProductId ? "Editar producto" : "Registrar producto"}</h3>
            {editingProductId && <button type="button" className="text-sm font-bold text-rose-600" onClick={cancelEditInventoryItem}>Cancelar</button>}
          </div>
          <p className="mt-1 text-sm text-slate-500">Usa el escaner o completa los campos manualmente. Si el SKU ya existe se agregara stock automaticamente.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-bold text-slate-700">Nombre del producto</label>
              <input list="name-list" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.name} onChange={(event) => {
                const name = event.target.value;
                if (!name) {
                  setNewInventoryItem({ name: "", category: "", model: "", sku: "", stock: "", minStock: "", cost: "", price: "", supplier: "", location: "" });
                  setEditingProductId(null);
                  return;
                }
                const match = inventory.find((i) => i.name === name);
                if (match) {
                  setEditingProductId(match.id);
                  setNewInventoryItem({ name, category: match.category, model: match.model, sku: match.sku, stock: String(match.stock), minStock: String(match.minStock), cost: String(match.cost), price: String(match.price), supplier: match.supplier, location: match.location });
                } else {
                  setEditingProductId(null);
                  setNewInventoryItem((prev) => ({ ...prev, name, sku: prev.sku || generateSkuFromName(name) }));
                }
              }} placeholder="Buscar producto existente o escribir nuevo" />
            </div>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              SKU / codigo de barras
              <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.sku} onChange={(event) => setNewInventoryItem((item) => ({ ...item, sku: event.target.value }))} placeholder="Ej. MON-001 o codigo de barras" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Categoria
              <input list="cat-list" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.category} onChange={(event) => setNewInventoryItem((item) => ({ ...item, category: event.target.value }))} placeholder="Ej. Monturas, Lentes" />
            </label>
            <div className="grid gap-2">
              <label className="text-sm font-bold text-slate-700">Modelo</label>
              <input list="model-list" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.model} onChange={(event) => {
                const mod = event.target.value;
                if (!mod) {
                  setNewInventoryItem({ name: "", category: "", model: "", sku: "", stock: "", minStock: "", cost: "", price: "", supplier: "", location: "" });
                  setEditingProductId(null);
                  return;
                }
                const match = inventory.find((i) => i.model === mod);
                if (match) {
                  setEditingProductId(match.id);
                  setNewInventoryItem({ name: match.name, category: match.category, model: mod, sku: match.sku, stock: String(match.stock), minStock: String(match.minStock), cost: String(match.cost), price: String(match.price), supplier: match.supplier, location: match.location });
                } else {
                  setEditingProductId(null);
                  setNewInventoryItem((prev) => ({ ...prev, model: mod }));
                }
              }} placeholder="Buscar modelo existente o escribir nuevo" />
            </div>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Proveedor
              <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.supplier} onChange={(event) => setNewInventoryItem((item) => ({ ...item, supplier: event.target.value }))} placeholder="Nombre del proveedor" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Stock / cantidad
              <input type="number" min="1" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.stock} onChange={(event) => setNewInventoryItem((item) => ({ ...item, stock: event.target.value }))} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Stock minimo
              <input type="number" min="0" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.minStock} onChange={(event) => setNewInventoryItem((item) => ({ ...item, minStock: event.target.value }))} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Ubicacion
              <input list="location-list" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.location} onChange={(event) => setNewInventoryItem((item) => ({ ...item, location: event.target.value }))} placeholder="Ej. Vitrina A, Deposito" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Precio de compra (costo)
              <input type="number" min="0" step="0.01" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.cost} onChange={(event) => setNewInventoryItem((item) => ({ ...item, cost: event.target.value }))} placeholder="B/. 0.00" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Precio de venta
              <input type="number" min="0" step="0.01" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={newInventoryItem.price} onChange={(event) => setNewInventoryItem((item) => ({ ...item, price: event.target.value }))} placeholder="B/. 0.00" />
            </label>
            <div className="sm:col-span-2"><button className="w-full rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white shadow-lg shadow-cyan-600/20">{editingProductId ? "Actualizar producto" : "Guardar producto"}</button></div>
          </div>
          <datalist id="name-list">
            {[...new Set(inventory.map((i) => i.name))].filter(Boolean).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <datalist id="cat-list">
            <option value="Metal Hombre" />
            <option value="Metal Mujer" />
            <option value="Pasta" />
          </datalist>
          <datalist id="model-list">
            {[...new Set(inventory.map((i) => i.model))].filter(Boolean).map((mod) => (
              <option key={mod} value={mod} />
            ))}
          </datalist>
          <datalist id="location-list">
            <option value="Vitrina" />
            <option value="Repisa 1" />
            <option value="Repisa 2" />
            <option value="Repisa 3" />
            <option value="Repisa 4" />
            <option value="Repisa 5" />
            <option value="Repisa 6" />
            <option value="Repisa 7" />
            <option value="Repisa 8" />
            <option value="Repisa 9" />
            <option value="Repisa 10" />
            {[...new Set(inventory.map((i) => i.location))].filter((loc) => loc && !["laboratorio","mostrador","depósito","deposito","vitrina a","vitrina b","consultorio","gabinete","vitrina 1","vitrina  1"].includes(loc.toLowerCase())).map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </form>

        <div className="rounded-[2rem] bg-white/80 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} placeholder="Buscar por nombre, SKU o proveedor" />
            <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={inventoryCategory} onChange={(event) => setInventoryCategory(event.target.value)}>
              {["Todas", "Metal Hombre", "Metal Mujer", "Pasta"].map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>

          <div className="mt-5 grid gap-4">
            {visibleInventory.map((item) => (
              <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 cursor-pointer transition hover:shadow-md" onClick={() => { startEditInventoryItem(item); inventoryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black text-slate-950">{item.name}</p>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{item.category}{item.model ? ` / ${item.model}` : ""}{item.location ? ` · ${item.location}` : ""}</p>
                  </div>
                  <p className="text-2xl font-black text-slate-950">{formatMoney(item.price)}</p>
                </div>
                <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><span className="font-semibold text-slate-500">SKU:</span> <span className="text-slate-700">{item.sku}</span></div>
                  <div><span className="font-semibold text-slate-500">Proveedor:</span> <span className="text-slate-700">{item.supplier}</span></div>
                  <div><span className="font-semibold text-slate-500">Stock:</span> <span className="font-black text-slate-950">{item.stock}</span> <span className="text-slate-400">/ min {item.minStock}</span></div>
                  <div><span className="font-semibold text-slate-500">Costo:</span> <span className="text-slate-700">{formatMoney(item.cost)}</span></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 font-black text-slate-900" onClick={() => updateStock(item.id, -1)}>-</button>
                  <button className="grid h-9 w-9 place-items-center rounded-full bg-cyan-600 font-black text-white" onClick={() => updateStock(item.id, 1)}>+</button>
                  <button className="ml-auto rounded-full bg-amber-500 px-4 py-2 text-xs font-black text-white shadow-md" onClick={() => startEditInventoryItem(item)}>Editar</button>
                  <button className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white shadow-md" onClick={() => deleteInventoryItem(item.id)}>Eliminar</button>
                </div>
              </div>
            ))}
            {visibleInventory.length === 0 && <p className="text-sm text-slate-400">No hay productos en el inventario.</p>}
          </div>
        </div>
      </section>
    </div>
  );

  const purchasesView = (
    <div className="space-y-8">
      <SectionTitle title="Compras a proveedores" subtitle="Ordenes de compra con RUC/DV del proveedor, ITBMS pagado y estado para calcular credito fiscal del Formulario 430." />
      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <form className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80" onSubmit={addPurchase}>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-950">{editingPurchaseId ? "Editar compra" : "Nueva compra"}</h3>
            {editingPurchaseId && <button type="button" className="text-sm font-bold text-rose-600" onClick={cancelEditPurchase}>Cancelar</button>}
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Proveedor
              <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={purchaseForm.supplier} onChange={(event) => setPurchaseForm((form) => ({ ...form, supplier: event.target.value }))} placeholder="Laboratorio o distribuidor" />
            </label>
            <div className="grid gap-4 sm:grid-cols-[1fr_80px]">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                RUC
                <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={purchaseForm.ruc} onChange={(event) => setPurchaseForm((form) => ({ ...form, ruc: event.target.value }))} placeholder="RUC proveedor" />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                DV
                <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={purchaseForm.dv} onChange={(event) => setPurchaseForm((form) => ({ ...form, dv: event.target.value }))} placeholder="00" />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-bold text-slate-700">Lineas de compra</p>
              {purchaseLines.length === 0 && <p className="text-sm text-slate-400">Agrega productos a la compra.</p>}
              {purchaseLines.map((line, index) => {
                const invItem = inventory.find((i) => i.sku === line.barcode);
                return (
                  <div key={index} className="mb-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-slate-700">{line.description}</span>
                        {invItem && <div className="mt-0.5 text-xs text-slate-400">{invItem.category}{invItem.model ? ` / ${invItem.model}` : ""}</div>}
                        {line.barcode && <div className="font-mono text-xs font-bold text-cyan-700">Cod: {line.barcode}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-nowrap text-slate-500">{line.qty} x {formatMoney(line.unitPrice)}</span>
                        <span className="font-bold text-slate-900">{formatMoney(line.qty * line.unitPrice)}</span>
                        <button type="button" onClick={() => removePurchaseLine(index)} className="text-rose-500 hover:text-rose-700">&times;</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="mt-3 grid grid-cols-[1fr_140px_70px_100px_40px] gap-2">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500" value={purchaseLineForm.description} onChange={(e) => setPurchaseLineForm((f) => ({ ...f, description: e.target.value }))} placeholder="Producto" />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-cyan-500" value={purchaseLineForm.barcode} onChange={(e) => {
                  const code = e.target.value;
                  const match = inventory.find((item) => item.sku.toLowerCase() === code.toLowerCase());
                  setPurchaseLineForm((f) => ({
                    ...f,
                    barcode: code,
                    description: match?.name ?? f.description,
                    unitPrice: match ? String(match.price) : f.unitPrice,
                  }));
                }} placeholder="Cod. barra (opcional)" />
                <input type="number" min="1" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500" value={purchaseLineForm.qty} onChange={(e) => setPurchaseLineForm((f) => ({ ...f, qty: e.target.value }))} placeholder="Cant." />
                <input type="number" min="0" step="0.01" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500" value={purchaseLineForm.unitPrice} onChange={(e) => setPurchaseLineForm((f) => ({ ...f, unitPrice: e.target.value }))} placeholder="Precio" />
                <button type="button" onClick={addPurchaseLine} className="rounded-xl bg-cyan-600 text-sm font-black text-white">+</button>
              </div>
            </div>

            {purchaseLines.length > 0 && (
              <div className="flex justify-between rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
                <span>{purchaseLines.reduce((s, l) => s + l.qty, 0)} articulos</span>
                <span>Subtotal {formatMoney(purchaseLines.reduce((s, l) => s + l.qty * l.unitPrice, 0))} · ITBMS {formatMoney(purchaseLines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * PANAMA_TAX_RATE)} · Total {formatMoney(purchaseLines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * (1 + PANAMA_TAX_RATE))}</span>
              </div>
            )}

            <button disabled={purchaseLines.length === 0} className="rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white shadow-lg shadow-cyan-600/20 disabled:opacity-40">{editingPurchaseId ? "Guardar cambios" : "Registrar orden"}</button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Credito ITBMS" value={formatMoney(purchaseTax)} caption="Compras recibidas o pagadas." tone="emerald" />
            <Metric label="Ordenes abiertas" value={String(purchases.filter((purchase) => purchase.status !== "Pagada").length)} caption="Pendientes de recibir o pagar." tone="amber" />
            <Metric label="Compras" value={formatMoney(purchases.reduce((sum, purchase) => sum + purchase.total, 0))} caption="Total historico demo." tone="slate" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
            <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={purchaseQuery} onChange={(e) => setPurchaseQuery(e.target.value)} placeholder="Buscar por proveedor, RUC o ID" />
            <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={purchaseStatusFilter} onChange={(e) => setPurchaseStatusFilter(e.target.value)}>
              {["Todas", "Pendiente", "Recibida", "Pagada"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="rounded-2xl bg-cyan-100 px-4 py-3 font-bold text-cyan-700" onClick={exportAllPurchasesCSV}>CSV</button>
          </div>
          {visiblePurchases.length === 0 && <p className="text-sm text-slate-400">No se encontraron ordenes.</p>}
          {visiblePurchases.map((purchase) => (
            <article key={purchase.id} className="rounded-[2rem] bg-white/80 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-black text-slate-950">{purchase.id} · {purchase.supplier}</h3>
                    <StatusBadge status={purchase.status} />
                  </div>
                  <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
                    <span className="font-semibold text-slate-500">RUC:</span>
                    <span className="text-slate-700">{purchase.ruc}</span>
                    <span className="font-semibold text-slate-500">DV:</span>
                    <span className="text-slate-700">{purchase.dv}</span>
                    <span className="font-semibold text-slate-500">Emisión:</span>
                    <span className="text-slate-700">{formatDate(purchase.date)}</span>
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-2xl font-black text-slate-950">{formatMoney(purchase.total)}</p>
                  <p className="text-sm text-slate-500">ITBMS {formatMoney(purchase.tax)}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                {(purchase.lines || []).map((line, i) => {
                  const invItem = inventory.find((inv) => inv.sku === line.barcode);
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-700">{line.description}</span>
                        {invItem && <div className="text-xs text-slate-400">{invItem.category}{invItem.model ? ` / ${invItem.model}` : ""}</div>}
                        {line.barcode && <div className="font-mono text-xs font-bold text-cyan-600">{line.barcode}</div>}
                      </div>
                      <span className="shrink-0 text-slate-500">{line.qty} x {formatMoney(line.unitPrice)}</span>
                      <span className="shrink-0 font-semibold text-slate-900">{formatMoney(line.qty * line.unitPrice)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700" onClick={() => updatePurchaseStatus(purchase.id, "Recibida")}>Marcar recibida</button>
                <button className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white" onClick={() => updatePurchaseStatus(purchase.id, "Pagada")}>Marcar pagada</button>
                <button className="rounded-full bg-cyan-100 px-4 py-2 text-sm font-bold text-cyan-700" onClick={() => startEditPurchase(purchase)}>Editar</button>
                <button className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700" onClick={() => exportPurchasePDF(purchase)}>PDF</button>
                <button className="rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700" onClick={() => deletePurchase(purchase.id)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );

  const invoicePreview = selectedInvoice ? (
    <aside className="rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-300/50 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-700">CAFE</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">{business.name}</h3>
          <p className="mt-1 text-sm text-slate-500">Propietario: {business.owner}</p>
          <p className="text-sm text-slate-500">{business.ruc} · DV {business.dv}</p>
        </div>
        <div className="text-right">
          <p className="font-black text-slate-950">{selectedInvoice.id}</p>
          <StatusBadge status={selectedInvoice.status} />
        </div>
      </div>
      <div className="grid gap-4 border-b border-slate-200 py-5 text-sm sm:grid-cols-2">
        <div>
          <p className="font-black text-slate-900">Cliente</p>
          <p className="mt-1 text-slate-600">{selectedInvoice.customer}</p>
          <p className="text-slate-600">Documento/RUC: {selectedInvoice.document} DV {selectedInvoice.dv}</p>
        </div>
        <div>
          <p className="font-black text-slate-900">Factura electronica</p>
          <p className="mt-1 break-all text-slate-600">CUFE: {selectedInvoice.cufe}</p>
          <p className="text-slate-600">{selectedInvoice.cafe} · {formatDate(selectedInvoice.date)}</p>
        </div>
      </div>
      <div className="py-5">
        <div className="space-y-3">
          {selectedInvoice.lines.map((line, index) => (
            <div key={`${line.itemId}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
              <div>
                <p className="font-black text-slate-900">{line.description}</p>
                <p className="text-slate-500">Cant. {line.qty} · {formatMoney(line.unitPrice)} · ITBMS {(line.taxRate * 100).toFixed(0)}%</p>
              </div>
              <p className="font-black text-slate-950">{formatMoney(lineSubtotal(line) + lineTax(line))}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2 border-t border-slate-200 pt-5 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><strong>{formatMoney(selectedInvoiceTotals.subtotal)}</strong></div>
        <div className="flex justify-between"><span>ITBMS</span><strong>{formatMoney(selectedInvoiceTotals.tax)}</strong></div>
        <div className="flex justify-between text-xl"><span className="font-black">Total</span><strong>{formatMoney(selectedInvoiceTotals.total)}</strong></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>Imprimir</button>
        <button className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white" onClick={() => markInvoicePaid(selectedInvoice.id)}>Marcar pagada</button>
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-500">Demo fiscal: para produccion se debe conectar con facturador gratuito DGI/SFEP o PAC autorizado para validacion real de CUFE, QR y eventos.</p>
    </aside>
  ) : (
    <EmptyState title="Sin factura" subtitle="Emite una factura para ver el CAFE." />
  );

  const billingView = (
    <div className="space-y-8">
      <SectionTitle title="Facturacion al cliente" subtitle="Punto de venta con RUC/DV o consumidor final, calculo de ITBMS 7%, lineas exentas y representacion CAFE para la factura electronica panamena." />
      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
            <h3 className="text-xl font-black text-slate-950">Nueva factura</h3>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_120px_auto] lg:items-end">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Cliente
                <input list="customer-list" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoiceCustomerName} onChange={(event) => { setInvoiceCustomerName(event.target.value); const found = customers.find((c) => c.name === event.target.value); setInvoiceCustomerId(found ? found.id : ""); if (found) { setInvoiceCustomerDoc(""); setInvoiceCustomerPhone(""); setInvoiceCustomerAddress(""); } }} placeholder="Escribe o selecciona un cliente" autoComplete="off" />
                <datalist id="customer-list">
                  {customers.map((customer) => <option key={customer.id} value={customer.name} />)}
                </datalist>
                {!customers.some((c) => c.name === invoiceCustomerName) && invoiceCustomerName.trim() && (
                  <div className="mt-2 grid gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
                    <p className="text-xs font-bold text-cyan-700">Nuevo cliente — completa los datos</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoiceCustomerDoc} onChange={(event) => setInvoiceCustomerDoc(event.target.value)} placeholder="Cedula / RUC" />
                      <input className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoiceCustomerPhone} onChange={(event) => setInvoiceCustomerPhone(event.target.value)} placeholder="Telefono" />
                      <input className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoiceCustomerAddress} onChange={(event) => setInvoiceCustomerAddress(event.target.value)} placeholder="Direccion" />
                    </div>
                    <button className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white" onClick={saveInvoiceCustomer}>Guardar cliente</button>
                  </div>
                )}
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Producto o servicio
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoiceItemId} onChange={(event) => setInvoiceItemId(event.target.value)}>
                  {(() => {
                    const servicios: typeof inventory = [];
                    const productos: typeof inventory = [];
                    for (const item of inventory) {
                      if (item.category?.toLowerCase().includes("servicio")) servicios.push(item);
                      else productos.push(item);
                    }
                    const opts: ReactNode[] = [];
                    if (servicios.length) opts.push(<optgroup key="serv" label="Servicios">{servicios.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(item.price)}</option>)}</optgroup>);
                    if (productos.length) opts.push(<optgroup key="prod" label="Productos">{productos.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(item.price)}</option>)}</optgroup>);
                    return opts;
                  })()}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Cant.
                <input type="number" min="1" step="1" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoiceQty} onChange={(event) => setInvoiceQty(event.target.value)} />
              </label>
              <button className={cn("rounded-2xl px-5 py-3 font-black text-white shadow-lg transition", applyItbms ? "bg-amber-600 shadow-amber-600/20" : "bg-slate-400 shadow-slate-400/20")} onClick={() => setApplyItbms(!applyItbms)}>ITBMS {applyItbms ? "ON" : "OFF"}</button>
              <button className="rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white shadow-lg shadow-cyan-600/20" onClick={addInvoiceLine}>Agregar</button>
            </div>

            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200">
              {draftLines.length === 0 ? (
                <div className="p-5"><EmptyState title="Factura sin lineas" subtitle="Agrega productos o servicios para calcular el total." /></div>
              ) : (
                <div className="divide-y divide-slate-200 bg-white">
                  {draftLines.map((line, index) => (
                    <div key={`${line.itemId}-${index}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div>
                        <p className="font-black text-slate-950">{line.description}</p>
                        <p className="text-sm text-slate-500">Cant. {line.qty} · ITBMS {(line.taxRate * 100).toFixed(0)}%</p>
                      </div>
                      <p className="font-black text-slate-950">{formatMoney(lineSubtotal(line) + lineTax(line))}</p>
                      <button className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600" onClick={() => removeInvoiceLine(index)}>Quitar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 rounded-[1.5rem] bg-slate-50 p-5 md:grid-cols-[1fr_auto] md:items-end">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Forma de pago
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoicePayment} onChange={(event) => setInvoicePayment(event.target.value)}>
                  <option>Efectivo</option>
                  <option>Tarjeta Clave</option>
                  <option>Yappy / ACH</option>
                  <option>Credito</option>
                </select>
              </label>
              <div className="text-left md:text-right">
                <p className="text-sm text-slate-500">Subtotal {formatMoney(draftTotals.subtotal)} · ITBMS {formatMoney(draftTotals.tax)}</p>
                <p className="text-3xl font-black text-slate-950">{formatMoney(draftTotals.total)}</p>
              </div>
              <button className="rounded-2xl bg-slate-950 px-6 py-3 font-black text-white md:col-span-2" onClick={issueInvoice}>Emitir factura</button>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-black text-slate-950">Facturas recientes</h3>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full bg-cyan-100 px-4 py-2 text-sm font-bold text-cyan-700" onClick={exportInvoicesCSV}>CSV</button>
              </div>
            </div>
            <div className="mt-3">
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={invoiceQuery} onChange={(e) => setInvoiceQuery(e.target.value)} placeholder="Buscar por ID, cliente o documento" />
            </div>
            <div className="mt-4 grid gap-3">
              {visibleInvoices.length === 0 && <p className="text-sm text-slate-400">No se encontraron facturas.</p>}
              {visibleInvoices.map((invoice) => {
                const totals = invoiceTotals(invoice.lines);
                return (
                  <button key={invoice.id} className={cn("rounded-3xl p-4 text-left ring-1 transition", activeInvoiceId === invoice.id ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-950 ring-slate-200 hover:bg-slate-50")} onClick={() => setActiveInvoiceId(invoice.id)}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-black">{invoice.id} · {invoice.customer}</p>
                        <p className={cn("mt-1 text-sm", activeInvoiceId === invoice.id ? "text-slate-300" : "text-slate-500")}>{formatDate(invoice.date)} · {invoice.payment}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={invoice.status} />
                        <p className="text-xl font-black">{formatMoney(totals.total)}</p>
                        <button className={cn("rounded-full px-3 py-1.5 text-xs font-bold", activeInvoiceId === invoice.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600")} onClick={(e) => { e.stopPropagation(); exportInvoicePDF(invoice); }}>PDF</button>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {invoicePreview}
      </section>
    </div>
  );

  const servicesView = (
    <div className="space-y-8">
      <SectionTitle title="Pagos de servicios y contables" subtitle="Controla luz, agua, celular, tarjeta de credito, alquiler, nomina, seguros e impuestos con categorias, vencimientos y metodos de pago." />
      <section className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <form className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80" onSubmit={addServicePayment}>
          <h3 className="text-xl font-black text-slate-950">Nuevo pago</h3>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Servicio
              <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={serviceForm.service} onChange={(event) => setServiceForm((form) => ({ ...form, service: event.target.value }))} placeholder="Ej. alquiler local" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Proveedor
              <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={serviceForm.provider} onChange={(event) => setServiceForm((form) => ({ ...form, provider: event.target.value }))} placeholder="Nombre del proveedor" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Categoria
              <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={serviceForm.category} onChange={(event) => setServiceForm((form) => ({ ...form, category: event.target.value as ServiceCategory }))}>
                <option value="Servicios publicos">Servicios publicos</option>
                <option value="Telecomunicaciones">Telecomunicaciones</option>
                <option value="Financiero">Financiero</option>
                <option value="Alquiler">Alquiler</option>
                <option value="Nomina">Nomina</option>
                <option value="Seguros">Seguros</option>
                <option value="Impuestos">Impuestos</option>
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Vence
                <input type="date" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={serviceForm.dueDate} onChange={(event) => setServiceForm((form) => ({ ...form, dueDate: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Monto
                <input type="text" inputMode="decimal" className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={serviceForm.amount} onChange={(event) => setServiceForm((form) => ({ ...form, amount: event.target.value }))} />
              </label>
            </div>
            <button className="rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white shadow-lg shadow-cyan-600/20">Guardar pago</button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Total pagos mes" value={formatMoney(servicePayments.filter((p) => p.status === "Pagado").reduce((s, p) => s + p.amount, 0))} caption="Suma de pagos realizados" tone="emerald" />
            <Metric label="Pendientes" value={formatMoney(servicePayments.filter((p) => p.status !== "Pagado").reduce((s, p) => s + p.amount, 0))} caption="Por pagar este periodo" tone="amber" />
            <Metric label="Servicios" value={String(servicePayments.length)} caption="Registros activos" tone="slate" />
          </div>
          {(["Servicios publicos", "Telecomunicaciones", "Financiero", "Alquiler", "Seguros", "Impuestos"] as ServiceCategory[]).map((cat) => {
            const catPayments = servicePayments.filter((p) => p.category === cat);
            if (catPayments.length === 0) return null;
            return (
              <div key={cat} className="rounded-[2rem] bg-white/80 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-black text-slate-950">{cat}</h3>
                  <p className="text-sm font-bold text-slate-500">{formatMoney(catPayments.reduce((s, p) => s + p.amount, 0))}</p>
                </div>
                <div className="mt-4 grid gap-3">
                  {catPayments.map((payment) => (
                    <div key={payment.id} className="grid gap-3 rounded-3xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-950">{payment.service}</p>
                          <StatusBadge status={payment.status} />
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{payment.provider} · {payment.method}</p>
                      </div>
                      <p className="text-xl font-black text-slate-950">{formatMoney(payment.amount)}</p>
                      {payment.status !== "Pagado" && <button className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white" onClick={() => markServicePaid(payment.id)}>Pagar</button>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  const usersView = (
    <div className="space-y-8">
      <SectionTitle title="Clientes" subtitle="Administra perfiles de administrador y clientes, datos fiscales, contacto e historia optometrica basica." />
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80" onSubmit={addCustomer}>
          <h3 className="text-xl font-black text-slate-950">Crear cliente</h3>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Nombre o razon social
              <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={customerForm.name} onChange={(event) => setCustomerForm((form) => ({ ...form, name: event.target.value }))} />
            </label>
            <div className="grid gap-4 sm:grid-cols-[1fr_70px]">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Cedula / RUC
                <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={customerForm.document} onChange={(event) => setCustomerForm((form) => ({ ...form, document: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                DV
                <input type="text" className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={customerForm.dv} onChange={(event) => setCustomerForm((form) => ({ ...form, dv: event.target.value }))} placeholder="00" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Email
                <input type="email" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={customerForm.email} onChange={(event) => setCustomerForm((form) => ({ ...form, email: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Telefono
                <input type="text" className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={customerForm.phone} onChange={(event) => setCustomerForm((form) => ({ ...form, phone: event.target.value }))} placeholder="+507" />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Direccion
              <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={customerForm.address} onChange={(event) => setCustomerForm((form) => ({ ...form, address: event.target.value }))} placeholder="Calle, edificio, piso" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Formula optica
              <textarea className="min-h-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={customerForm.prescription} onChange={(event) => setCustomerForm((form) => ({ ...form, prescription: event.target.value }))} placeholder="OD, OI, eje, cilindro, esfera, ADD, DP" />
            </label>
            <button className="rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white shadow-lg shadow-cyan-600/20">Crear usuario cliente</button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
            <h3 className="text-xl font-black text-slate-950">Contacto y horario</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-cyan-50 p-4 ring-1 ring-cyan-200">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Celular</p>
                <p className="mt-2 text-lg font-black text-cyan-900">{business.celular}</p>
              </div>
              <div className="rounded-2xl bg-cyan-50 p-4 ring-1 ring-cyan-200">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Fijo</p>
                <p className="mt-2 text-lg font-black text-cyan-900">{business.fijo}</p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Horario de atencion</p>
              <p className="mt-2 text-lg font-black text-slate-900">{business.hours}</p>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
            <h3 className="text-xl font-black text-slate-950">Cuentas de acceso</h3>
            <div className="mt-4 grid gap-3">
              {users.map((user) => (
                <div key={user.id} className="flex flex-col gap-3 rounded-3xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black text-slate-950">{user.name}</p>
                    <p className="text-sm text-slate-500">{user.email} · rol {user.role}</p>
                  </div>
                  <StatusBadge status={user.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
            <h3 className="text-xl font-black text-slate-950">Clientes</h3>
            <div className="mt-4 grid gap-3">
              {customers.map((customer) => (
                <article key={customer.id} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <p className="font-black text-slate-950">{customer.name}</p>
                      <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
                        <span className="font-semibold text-slate-500">Documento:</span>
                        <span className="text-slate-700">{customer.document}</span>
                        <span className="font-semibold text-slate-500">DV:</span>
                        <span className="text-slate-700">{customer.dv}</span>
                        <span className="font-semibold text-slate-500">Teléfono:</span>
                        <span className="text-slate-700">{customer.phone}</span>
                        <span className="font-semibold text-slate-500">Email:</span>
                        <span className="text-slate-700">{customer.email}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{customer.prescription}</p>
                    </div>
                    <p className="text-lg font-black text-slate-950">{formatMoney(customer.balance)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const complianceView = (
    <div className="space-y-8">
      <SectionTitle title="Sistema para opticas en Panama" subtitle="Parametros operativos basados en facturacion electronica panamena, ITBMS y necesidades de una optica: receta, inventario tecnico, compras y atencion al cliente." />
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Checklist fiscal</p>
          <div className="mt-6 space-y-4">
            {[
              "Configurar RUC y DV reales de Servicios Opticos Profesionales antes de produccion.",
              "Emitir facturas electronicas por SFEP/DGI o por un PAC autorizado y conservar CUFE/CAFE.",
              "Parametrizar ITBMS general 7%, tasas especiales o exenciones con el contador.",
              "Reportar debito fiscal de ventas y credito fiscal de compras para Formulario 430.",
              "Soportar notas de credito/debito y eventos de anulacion en una fase de integracion.",
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-3xl bg-white/10 p-4">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300" />
                <p className="text-sm leading-6 text-slate-200">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-700">Alcance funcional</p>
          <div className="mt-6 grid gap-4">
            {[
              ["Optometria", "Historia visual, receta OD/OI, cilindro, eje, adicion, DP y citas."],
              ["Inventario", "SKU, minimo, costo, precio, ubicacion, proveedor y descuento de stock al facturar."],
              ["Compras", "Ordenes con RUC/DV de proveedor y calculo de ITBMS pagado."],
              ["Facturacion", "Cliente natural, empresa o consumidor final con CAFE de demostracion."],
              ["Portal cliente", "Facturas, citas, saldo, formula y canal de solicitud desde movil."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-3xl bg-slate-50 p-4">
                <p className="font-black text-slate-950">{title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-amber-50 p-6 ring-1 ring-amber-200">
        <h3 className="text-xl font-black text-amber-950">Importante para produccion</h3>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-amber-900">
          Esta version es un prototipo funcional de frontend. La validacion fiscal real requiere completar los datos tributarios del negocio, contratar PAC o usar el facturador DGI/SFEP, firmar documentos, generar QR autorizado, guardar XML y validar eventos segun la ficha tecnica vigente.
        </p>
      </section>
    </div>
  );

  const techAdvancesView = (
    <div className="space-y-8">
      <SectionTitle title="Ultimos avances en gafas y lentes" subtitle="Tecnologia optica de vanguardia: lentes inteligentes, materiales premium, proteccion digital y bienestar visual para tus clientes." />
      
      <section className="grid gap-4 sm:grid-cols-5">
        {["Todos", "Proteccion digital", "Multifocales", "Lentes inteligentes", "Materiales premium", "Bienestar visual", "Tecnologia inmersiva", "Tratamientos", "Smart eyewear", "Lentes especiales"].map((cat) => (
          <button key={cat} className={cn("rounded-full px-4 py-2 text-xs font-bold transition", techFilter === cat ? "bg-slate-950 text-white" : "bg-white/80 text-slate-700 ring-1 ring-slate-200 hover:bg-white")} onClick={() => setTechFilter(cat)}>
            {cat}
          </button>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {techAdvances.filter((ta) => techFilter === "Todos" || ta.category === techFilter).map((advance) => (
          <article key={advance.id} className="reveal-up rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80 transition hover:-translate-y-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">{advance.category}</p>
                <h3 className="mt-2 text-xl font-black text-slate-950">{advance.title}</h3>
              </div>
              <StatusBadge status={advance.badge} />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{advance.description}</p>
            <div className="mt-4 rounded-3xl bg-cyan-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Beneficios</p>
              <p className="mt-2 text-sm font-bold text-cyan-900">{advance.benefits}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-lg font-black text-slate-950">{advance.priceRange}</p>
              <button className="rounded-full bg-cyan-600 px-4 py-2 text-xs font-black text-white" onClick={() => {
                setRole("Administrador");
                setActiveView("inventario");
              }}>Agregar al inventario</button>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white shadow-2xl shadow-slate-950/20">
        <h3 className="text-2xl font-black">¿Por que ofrecer tecnologia avanzada?</h3>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
            <p className="text-3xl font-black text-cyan-300">78%</p>
            <p className="mt-2 text-sm font-bold text-slate-200">de los clientes prefiere lentes con filtro de luz azul para trabajo frente a pantallas.</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
            <p className="text-3xl font-black text-emerald-300">+40%</p>
            <p className="mt-2 text-sm font-bold text-slate-200">de incremento en ventas al ofrecer lentes progresivos digitales Free Form.</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
            <p className="text-3xl font-black text-amber-300">B/. 85</p>
            <p className="mt-2 text-sm font-bold text-slate-200">de valor promedio adicional por cliente al ofrecer recubrimientos premium.</p>
          </div>
        </div>
      </section>
    </div>
  );

  const portalView = activeClient ? (
    <div className="space-y-8">
      <SectionTitle title={`Hola, ${activeClient.name}`} subtitle="Portal del cliente para consultar facturas, formula optica, citas y saldos desde telefono, tableta o escritorio." />
      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="Saldo" value={formatMoney(activeClient.balance)} caption="Balance registrado por la optica." tone={activeClient.balance > 0 ? "amber" : "emerald"} />
        <Metric label="Facturas" value={String(clientInvoices.length)} caption="Documentos asociados a tu cuenta." tone="cyan" />
        <Metric label="Ultima visita" value={formatDate(activeClient.lastVisit)} caption="Registro clinico mas reciente." tone="slate" />
      </section>
      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
          <h3 className="text-xl font-black text-slate-950">Formula optica</h3>
          <p className="mt-4 rounded-3xl bg-slate-50 p-5 text-lg font-bold leading-8 text-slate-800">{activeClient.prescription}</p>
          <button className="mt-5 rounded-full bg-cyan-600 px-5 py-3 text-sm font-black text-white" onClick={() => setActiveView("citas")}>Solicitar revision</button>
        </div>
        <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
          <h3 className="text-xl font-black text-slate-950">Proximas citas</h3>
          <div className="mt-4 space-y-3">
            {clientAppointments.length === 0 ? <EmptyState title="Sin citas" subtitle="Solicita una fecha desde el portal." /> : clientAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{formatDate(appointment.date)}</p>
                    <p className="mt-1 text-sm text-slate-600">{appointment.reason}</p>
                  </div>
                  <StatusBadge status={appointment.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  ) : (
    <EmptyState title="Sin cliente activo" subtitle="Registra un cliente para usar el portal." />
  );

  const clientInvoicesView = (
    <div className="space-y-8">
      <SectionTitle title="Mis facturas" subtitle="Consulta facturas emitidas, CUFE de demostracion, total, estado y metodo de pago." />
      <section className="grid gap-4">
        {clientInvoices.length === 0 ? <EmptyState title="Sin facturas" subtitle="Aun no tienes documentos registrados." /> : clientInvoices.map((invoice) => {
          const totals = invoiceTotals(invoice.lines);
          return (
            <article key={invoice.id} className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-black text-slate-950">{invoice.id}</h3>
                    <StatusBadge status={invoice.status} />
                  </div>
                  <p className="mt-2 break-all text-sm text-slate-500">CUFE {invoice.cufe}</p>
                  <p className="text-sm text-slate-500">{formatDate(invoice.date)} · {invoice.payment}</p>
                </div>
                <p className="text-3xl font-black text-slate-950">{formatMoney(totals.total)}</p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );

  const prescriptionsView = activeClient ? (
    <div className="space-y-8">
      <SectionTitle title="Receta e historial" subtitle="Resumen optometrico para el cliente, util para reposiciones de lentes y seguimiento clinico." />
      <section className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-700">Paciente</p>
            <h3 className="mt-3 text-3xl font-black text-slate-950">{activeClient.name}</h3>
            <p className="mt-2 text-slate-500">Documento/RUC {activeClient.document} DV {activeClient.dv}</p>
            <p className="mt-2 text-slate-500">Ultima visita {formatDate(activeClient.lastVisit)}</p>
          </div>
          <div className="rounded-[2rem] bg-slate-50 p-6">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-slate-500">Formula actual</p>
            <p className="mt-4 text-xl font-black leading-9 text-slate-950">{activeClient.prescription}</p>
          </div>
        </div>
      </section>
    </div>
  ) : (
    <EmptyState title="Sin receta" subtitle="Selecciona un cliente." />
  );

  const appointmentsView = activeClient ? (
    <div className="space-y-8">
      <SectionTitle title="Solicitar cita" subtitle="Agenda revisiones, ajustes de montura, examen visual o seguimiento de lentes de contacto." />
      <section className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <form className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80" onSubmit={requestAppointment}>
          <h3 className="text-xl font-black text-slate-950">Nueva solicitud</h3>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Fecha preferida
              <input type="date" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={appointmentForm.date} onChange={(event) => setAppointmentForm((form) => ({ ...form, date: event.target.value }))} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Hora preferida
              <input type="time" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={appointmentForm.time} onChange={(event) => setAppointmentForm((form) => ({ ...form, time: event.target.value }))} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Motivo
              <textarea className="min-h-28 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={appointmentForm.reason} onChange={(event) => setAppointmentForm((form) => ({ ...form, reason: event.target.value }))} />
            </label>
            <button className="rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white shadow-lg shadow-cyan-600/20">Enviar solicitud</button>
          </div>
        </form>
        <div className="grid gap-4 md:grid-cols-2">
          {clientAppointments.map((appointment) => (
            <article key={appointment.id} className="rounded-[2rem] bg-white/80 p-5 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">{appointment.id}</p>
                  <h3 className="mt-2 text-xl font-black text-slate-950">{formatDate(appointment.date)} <span className="text-base font-bold text-slate-500">{appointment.time}</span></h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{appointment.reason}</p>
                </div>
                <StatusBadge status={appointment.status} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  ) : (
    <EmptyState title="Sin cliente" subtitle="Selecciona un cliente para agendar." />
  );

  const resultsView = (
    <div className="space-y-8">
      <SectionTitle title="Examenes de vision" subtitle="Registro de examenes visuales, formula optica y recomendaciones de lentes." />
      {isAdminRole(displayRole) && (
        <details className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
          <summary className="cursor-pointer text-lg font-black text-slate-950">Nuevo examen visual</summary>
          <form className="mt-6 grid gap-6" onSubmit={(e) => {
            e.preventDefault();
            const newExam: ExamResult = {
              id: `EXM-${String(examResults.length + 1).padStart(3, "0")}`,
              customerId: examForm.customerId,
              customerName: customers.find(c => c.id === examForm.customerId)?.name ?? "",
              date: new Date().toISOString(),
              odSphere: parseFloat(examForm.odSphere) || 0,
              odCylinder: parseFloat(examForm.odCylinder) || 0,
              odAxis: parseFloat(examForm.odAxis) || 0,
              oiSphere: parseFloat(examForm.oiSphere) || 0,
              oiCylinder: parseFloat(examForm.oiCylinder) || 0,
              oiAxis: parseFloat(examForm.oiAxis) || 0,
              add: parseFloat(examForm.add) || 0,
              dip: parseFloat(examForm.dip) || 0,
              needsLenses: examForm.needsLenses,
              lensType: examForm.lensType,
              notes: examForm.notes,
              status: "Completado",
            };
            setExamResults([newExam, ...examResults]);
            setExamForm(form => ({ ...form, notes: "" }));
            (e.currentTarget.querySelector("summary") as HTMLElement)?.click();
          }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Paciente
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={examForm.customerId} onChange={e => setExamForm(f => ({ ...f, customerId: e.target.value }))}>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <p className="col-span-full text-sm font-black text-cyan-700">Ojo derecho (OD)</p>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Esfera (SPH)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.odSphere} onChange={e => setExamForm(f => ({ ...f, odSphere: e.target.value }))} placeholder="Ej: -2.00" /></label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Cilindro (CYL)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.odCylinder} onChange={e => setExamForm(f => ({ ...f, odCylinder: e.target.value }))} placeholder="Ej: -0.75" /></label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Eje (AXIS)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.odAxis} onChange={e => setExamForm(f => ({ ...f, odAxis: e.target.value }))} placeholder="Ej: 180" /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <p className="col-span-full text-sm font-black text-cyan-700">Ojo izquierdo (OI)</p>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Esfera (SPH)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.oiSphere} onChange={e => setExamForm(f => ({ ...f, oiSphere: e.target.value }))} placeholder="Ej: -2.25" /></label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Cilindro (CYL)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.oiCylinder} onChange={e => setExamForm(f => ({ ...f, oiCylinder: e.target.value }))} placeholder="Ej: -0.50" /></label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Eje (AXIS)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.oiAxis} onChange={e => setExamForm(f => ({ ...f, oiAxis: e.target.value }))} placeholder="Ej: 175" /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-bold text-slate-700">Adicion (ADD)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.add} onChange={e => setExamForm(f => ({ ...f, add: e.target.value }))} placeholder="Ej: 1.50" /></label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">DIP (mm)<input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" type="text" value={examForm.dip} onChange={e => setExamForm(f => ({ ...f, dip: e.target.value }))} placeholder="Ej: 64" /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Requiere lentes
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={examForm.needsLenses ? "si" : "no"} onChange={e => setExamForm(f => ({ ...f, needsLenses: e.target.value === "si" }))}>
                  <option value="si">Si</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Tipo de lente recomendado
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={examForm.lensType} onChange={e => setExamForm(f => ({ ...f, lensType: e.target.value }))}>
                  <option>Monofocales</option>
                  <option>Bifocales</option>
                  <option>Progresivos</option>
                  <option>Lentes de contacto</option>
                  <option>Lentes de trabajo</option>
                  <option>Lentes de sol graduados</option>
                </select>
              </label>
            </div>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Notas / Observaciones
              <textarea className="min-h-20 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={examForm.notes} onChange={e => setExamForm(f => ({ ...f, notes: e.target.value }))} placeholder="Recomendaciones, hallazgos clinicos..." />
            </label>
            <button className="rounded-2xl bg-slate-950 px-8 py-3 font-black text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800">Guardar examen</button>
          </form>
        </details>
      )}
      <div className="grid gap-6">
        {(isAdminRole(role) ? examResults : examResults.filter(e => e.customerId === activeClientId)).map((exam) => {
          const formatRx = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
          return (
            <article key={exam.id} className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">{exam.id}</p>
                  <h3 className="mt-1 text-2xl font-black text-slate-950">{exam.customerName}</h3>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(exam.date)}</p>
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={exam.status as any} />
                </div>
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl bg-cyan-50 p-4 ring-1 ring-cyan-200">
                  <p className="text-sm font-black uppercase tracking-[0.15em] text-cyan-700">OD (derecho)</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{formatRx(exam.odSphere)} {formatRx(exam.odCylinder)} x {exam.odAxis}°</p>
                  <p className="text-xs text-slate-500">Esfera · Cilindro · Eje</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                  <p className="text-sm font-black uppercase tracking-[0.15em] text-emerald-700">OI (izquierdo)</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{formatRx(exam.oiSphere)} {formatRx(exam.oiCylinder)} x {exam.oiAxis}°</p>
                  <p className="text-xs text-slate-500">Esfera · Cilindro · Eje</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-6 text-sm">
                <p><span className="font-bold text-slate-700">ADD:</span> {exam.add.toFixed(2)}</p>
                <p><span className="font-bold text-slate-700">DIP:</span> {exam.dip} mm</p>
                <p><span className="font-bold text-slate-700">Lentes:</span> {exam.needsLenses ? exam.lensType : "No requiere"}</p>
              </div>
              {exam.notes && <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">{exam.notes}</p>}
              <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-5">
                <button className="rounded-xl bg-slate-950 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800" onClick={() => generateExamPDF(exam)}>Descargar PDF</button>
                <button className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700" onClick={() => {
                  generateExamPDF(exam);
                  window.open(whatsAppUrl(`Hola ${exam.customerName}, adjunto el resultado de su examen visual (${exam.id}). Puede descargarlo aqui o consultarnos cualquier duda.`), "_blank");
                }}>PDF + WhatsApp</button>
              </div>
            </article>
          );
        })}
        {examResults.length === 0 && <EmptyState title="Sin examenes registrados" subtitle="Realiza un examen visual para ver los resultados aqui." />}
      </div>
    </div>
  );

  const aiSearchView = (
    <ChatBot knowledgeBase={knowledgeBase} darkMode={darkMode} role={displayRole} onNavigate={setActiveView} inventory={inventory} customers={customers} invoices={invoices} purchases={purchases} />
  );

  const clinicalHistoriesView = (
    <div className="space-y-8">
      <SectionTitle title="Historias Clinicas" subtitle="Historial completo de examenes visuales, facturas y datos del paciente." />
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
            <h3 className="text-xl font-black text-slate-950">Paciente</h3>
            <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
              Seleccionar cliente
              <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" value={activeClientId} onChange={(e) => setActiveClientId(e.target.value)}>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
          </div>
          {(() => {
            const patient = customers.find((c) => c.id === activeClientId);
            if (!patient) return null;
            const patientExams = examResults.filter((e) => e.customerId === patient.id);
            const patientInvoices = invoices.filter((i) => i.customerId === patient.id);
            return (
              <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
                <h3 className="text-lg font-black text-slate-950">{patient.name}</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="font-bold text-slate-700">Cedula:</span> {patient.document}</p>
                  <p><span className="font-bold text-slate-700">Telefono:</span> {patient.phone}</p>
                  {patient.address && <p><span className="font-bold text-slate-700">Direccion:</span> {patient.address}</p>}
                  <p><span className="font-bold text-slate-700">Ultima visita:</span> {formatDate(patient.lastVisit)}</p>
                  <p><span className="font-bold text-slate-700">Formula:</span> {patient.prescription}</p>
                  <p><span className="font-bold text-slate-700">Saldo pendiente:</span> {formatMoney(patient.balance)}</p>
                </div>
                <div className="mt-4 flex gap-4 text-sm">
                  <div className="rounded-2xl bg-cyan-50 px-4 py-3 ring-1 ring-cyan-200">
                    <p className="text-xs font-black text-cyan-700">Examenes</p>
                    <p className="text-xl font-black text-cyan-900">{patientExams.length}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                    <p className="text-xs font-black text-emerald-700">Facturas</p>
                    <p className="text-xl font-black text-emerald-900">{patientInvoices.length}</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="space-y-6">
          {(() => {
            const patient = customers.find((c) => c.id === activeClientId);
            if (!patient) return <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80"><EmptyState title="Selecciona un paciente" subtitle="Elige un cliente para ver su historia clinica." /></div>;
            const patientExams = examResults.filter((e) => e.customerId === patient.id);
            const patientInvoices = invoices.filter((i) => i.customerId === patient.id);
            return (
              <>
                <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
                  <h3 className="text-lg font-black text-slate-950">Examenes visuales</h3>
                  {patientExams.length === 0 ? (
                    <div className="mt-4"><EmptyState title="Sin examenes" subtitle="Este paciente no tiene examenes registrados." /></div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {patientExams.map((exam) => {
                        const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
                        return (
                          <div key={exam.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-black text-cyan-700">{exam.id}</p>
                                <p className="text-sm text-slate-500">{formatDate(exam.date)}</p>
                              </div>
                              <StatusBadge status={exam.status as any} />
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-xl bg-cyan-50 p-3">
                                <p className="text-xs font-bold text-cyan-700">OD</p>
                                <p className="text-sm font-black">{fmt(exam.odSphere)} {fmt(exam.odCylinder)} x {exam.odAxis}°</p>
                              </div>
                              <div className="rounded-xl bg-emerald-50 p-3">
                                <p className="text-xs font-bold text-emerald-700">OI</p>
                                <p className="text-sm font-black">{fmt(exam.oiSphere)} {fmt(exam.oiCylinder)} x {exam.oiAxis}°</p>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                              <span>ADD {exam.add.toFixed(2)}</span>
                              <span>DIP {exam.dip} mm</span>
                              {exam.needsLenses && <span>Lentes: {exam.lensType}</span>}
                            </div>
                            {exam.notes && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">{exam.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded-[2rem] bg-white/80 p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200/80">
                  <h3 className="text-lg font-black text-slate-950">Facturas</h3>
                  {patientInvoices.length === 0 ? (
                    <div className="mt-4"><EmptyState title="Sin facturas" subtitle="Este paciente no tiene facturas registradas." /></div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {patientInvoices.map((invoice) => {
                        const totals = invoiceTotals(invoice.lines);
                        return (
                          <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                            <div>
                              <p className="text-sm font-black text-slate-950">{invoice.id}</p>
                              <p className="text-xs text-slate-500">{formatDate(invoice.date)} · {invoice.payment}</p>
                            </div>
                            <div className="text-right">
                              <StatusBadge status={invoice.status} />
                              <p className="mt-1 text-sm font-black">{formatMoney(totals.total)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </section>
    </div>
  );

  const contentByView: Record<View, ReactNode> = {
    panel: panelView,
    inventario: inventoryView,
    compras: purchasesView,
    facturacion: billingView,
    historias: clinicalHistoriesView,
    avances: techAdvancesView,
    servicios: servicesView,
    usuarios: usersView,
    cumplimiento: complianceView,
    ia: aiSearchView,
    resultados: resultsView,
    portal: portalView,
    "mis-facturas": clientInvoicesView,
    recetas: prescriptionsView,
    citas: appointmentsView,
  };

  return (
    <div className="min-h-screen bg-[#f4f1eb] text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="bg-orb absolute -left-24 top-20 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl" />
        <div className="bg-orb-delayed absolute right-0 top-1/3 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col lg:flex-row">
        <aside className={cn("sticky top-0 z-20 flex max-h-screen flex-col border-b px-4 py-4 backdrop-blur lg:h-screen lg:w-80 lg:border-b-0 lg:border-r lg:px-5 lg:py-6", darkMode ? "border-slate-700/80 bg-slate-950" : "border-slate-200/80 bg-[#f4f1eb]/90")}>
          <div className="flex flex-col gap-5">
            <Logo />
            {!isMobile && (
              <div className={cn("grid grid-cols-2 gap-2 rounded-full p-1 shadow-sm ring-1", darkMode ? "bg-slate-800 ring-slate-700" : "bg-white ring-slate-200")}>
                {(["Super Admin", "Administrador", "Cliente"] as Role[]).map((item) => (
                  <button key={item} className={cn("rounded-full px-3 py-2 text-sm font-black transition", displayRole === item ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15" : darkMode ? "text-slate-400 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100")} onClick={() => switchRole(item)} aria-pressed={displayRole === item}>
                    {item}
                  </button>
                ))}
              </div>
            )}

            {displayRole === "Cliente" && (
              <label className={cn("grid gap-2 text-sm font-bold", darkMode ? "text-slate-300" : "text-slate-700")}>
                Cliente activo
                <select className={cn("rounded-2xl border px-4 py-3 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100", darkMode ? "border-slate-600 bg-slate-800 text-white" : "border-slate-200 bg-white")} value={activeClientId} onChange={(event) => setActiveClientId(event.target.value)}>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
            )}
          </div>

          <nav className="-mx-1 flex gap-2 overflow-x-auto pb-2 lg:mx-0 lg:mt-5 lg:block lg:flex-1 lg:space-y-2 lg:overflow-y-auto lg:pb-0">
            {currentNav.map((item) => (
              <button key={item.id} className={cn("group min-w-44 rounded-3xl px-4 py-3 text-left transition lg:w-full", activeView === item.id ? "bg-slate-950 text-white shadow-xl shadow-slate-950/15" : darkMode ? "bg-slate-800 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700" : "bg-white/70 text-slate-700 ring-1 ring-slate-200 hover:bg-white")} onClick={() => setActiveView(item.id)}>
                <span className="block text-sm font-black">{item.label}</span>
                <span className={cn("mt-1 block text-xs leading-5", activeView === item.id ? "text-slate-300" : "text-slate-500")}>{item.description}</span>
              </button>
            ))}
          </nav>
          <button className={cn("mt-4 flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left text-sm font-black transition", darkMode ? "text-slate-400 ring-1 ring-slate-700 hover:bg-slate-800" : "text-slate-600 ring-1 ring-slate-200 hover:bg-white/70")} onClick={() => setDarkMode((d) => !d)}>
            <span className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-black", darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-700")}>{darkMode ? "O" : "C"}</span>
            {darkMode ? "Modo claro" : "Modo oscuro"}
          </button>
          {displayRole === "Super Admin" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-2 rounded-3xl bg-emerald-600 px-3 py-3 text-xs font-black text-white shadow-lg shadow-emerald-600/20" onClick={exportAllData}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-[10px] font-black text-white">↓</span>
                Exportar
              </button>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-3xl bg-blue-600 px-3 py-3 text-xs font-black text-white shadow-lg shadow-blue-600/20">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-[10px] font-black text-white">↑</span>
                Importar
                <input type="file" accept=".json" className="hidden" onChange={importAllData} />
              </label>
            </div>
          )}
          {displayRole === "Super Admin" && (
            <button className="mt-2 flex w-full items-center gap-3 rounded-3xl bg-amber-600 px-4 py-3 text-left text-sm font-black text-white shadow-lg shadow-amber-600/20" onClick={restoreFromAutoBackup}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xs font-black text-white">↺</span>
              Restaurar backup automatico
            </button>
          )}
          {displayRole === "Super Admin" && (
            <button className="mt-2 flex w-full items-center gap-3 rounded-3xl bg-rose-600 px-4 py-3 text-left text-sm font-black text-white shadow-lg shadow-rose-600/20" onClick={clearAllData}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xs font-black text-white">X</span>
              Limpiar datos de prueba
            </button>
          )}
        </aside>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <header className={cn("reveal-up mb-8 flex flex-col gap-4 rounded-[2rem] p-4 shadow-lg md:flex-row md:items-center md:justify-between", darkMode ? "bg-slate-900 shadow-black/30 ring-1 ring-slate-700/80 backdrop-blur" : "bg-white/75 shadow-slate-200/50 ring-1 ring-slate-200/80 backdrop-blur")}>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-700">{displayRole}</p>
              <p className={cn("mt-1 text-lg font-black", darkMode ? "text-white" : "text-slate-950")}>{isAdminRole(displayRole) ? (users.find((u) => u.role === displayRole)?.name ?? displayRole) : activeClient?.name ?? "Cliente"}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className={cn("text-sm font-black italic", darkMode ? "text-white/90" : "text-slate-500")}>Cuidamos tu salud visual con profesionalismo y calidez. Porque ver bien es vivir mejor.</p>
              <a className="rounded-2xl bg-cyan-600 px-5 py-3 text-center text-sm font-black text-white shadow-lg shadow-cyan-600/20" href={`https://www.google.com/maps/search/?api=1&query=8.430183,-82.426391`} target="_blank" rel="noreferrer">
                Ubicacion
              </a>
              <a className="rounded-2xl bg-emerald-600 px-5 py-3 text-center text-sm font-black text-white shadow-lg shadow-emerald-600/20" href={whatsAppUrl(displayRole, activeClient?.name)} target="_blank" rel="noreferrer">
                WhatsApp
              </a>

              {canInstall && (
                <button className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-amber-600/20" onClick={() => {
                  const html = '<!doctype html>' + document.documentElement.outerHTML;
                  const blob = new Blob([html], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "SOP-Optica.html";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}>
                  Instalar app
                </button>
              )}
              <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white" onClick={() => { stopScanner(); supabase.auth.signOut(); setSessionUser(null); }}>Salir</button>
            </div>
          </header>

          <div className="pb-10">{contentByView[activeView]}</div>
        </main>
      </div>
      <a
        className="fixed bottom-5 right-5 z-30 rounded-full bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-2xl shadow-emerald-900/25 ring-1 ring-white/40 transition hover:-translate-y-0.5"
                href={whatsAppUrl(role, activeClient?.name, true)}
        target="_blank"
        rel="noreferrer"
        aria-label="Contactar por WhatsApp"
      >
        WhatsApp
      </a>
    </div>
  );
}