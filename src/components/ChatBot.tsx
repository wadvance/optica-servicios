import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../utils/cn";

type KnowledgeEntry = {
  keywords: string[];
  title: string;
  content: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  action?: "appointment";
};

type InventoryItem = {
  id: string; name: string; sku: string; category: string; supplier: string;
  stock: number; minStock: number; price: number; cost: number; location: string;
  status: string;
};

type Customer = {
  id: string; name: string; document: string; dv: string; email: string;
  phone: string; address: string; prescription: string; lastVisit: string;
  balance: number; status: string;
};

type Invoice = {
  id: string; customerId: string; customer: string; document: string;
  date: string; payment: string; status: string; lines: any[];
};

type PurchaseOrder = {
  id: string; supplier: string; ruc: string; dv: string; date: string;
  dueDate: string; status: string; lines: any[]; subtotal: number;
  tax: number; total: number;
};

type Props = {
  knowledgeBase: KnowledgeEntry[];
  darkMode: boolean;
  role?: string;
  onNavigate?: (view: string) => void;
  inventory?: InventoryItem[];
  customers?: Customer[];
  invoices?: Invoice[];
  purchases?: PurchaseOrder[];
};

const APPT_KEYWORDS = [
  "agendar", "cita", "reservar", "programar", "revision",
  "examen visual", "consulta", "quiero una cita", "sacar cita",
  "pedir cita", "registrar cita", "nueva cita", "agenda",
];

function detectAppointmentIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  return APPT_KEYWORDS.some((kw) => t.includes(kw));
}

const SUGGESTIONS = [
  "Que son los lentes progresivos?",
  "Que es el filtro de luz azul?",
  "Cual es la diferencia entre policarbonato y alto indice?",
  "Que marcas de lentes recomiendas?",
  "Que es el tratamiento Crizal?",
  "Como cuidar mis lentes?",
];

const STORAGE_KEY = "sop-chat-history";

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ChatMessage[];
  } catch { /* ignore */ }
  return [];
}

function saveHistory(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50)));
  } catch { /* ignore */ }
}

let msgCounter = 0;
function msgId() { return `msg-${++msgCounter}-${Date.now()}`; }

function searchKnowledge(query: string, knowledge: KnowledgeEntry[], recentMessages: ChatMessage[]): string {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);

  const contextWords: string[] = [];
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const m = recentMessages[i];
    if (m.role === "user") {
      contextWords.push(...m.text.toLowerCase().split(/\s+/).filter(Boolean));
      break;
    }
  }
  const allWords = [...new Set([...words, ...contextWords])];

  const scored = knowledge.map((entry) => {
    let score = 0;
    for (const word of allWords) {
      for (const kw of entry.keywords) {
        if (kw.includes(word) || word.includes(kw)) score += 5;
      }
      if (entry.title.toLowerCase().includes(word)) score += 4;
      if (entry.content.toLowerCase().includes(word)) score += 1;
    }
    if (entry.keywords.some((kw) => q.includes(kw) || kw.includes(q))) score += 10;
    return { entry, score };
  });

  const best = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  if (best.length === 0) {
    const partial = knowledge.filter((e) =>
      e.keywords.some((kw) => words.some((w) => kw.includes(w) || w.includes(kw)))
    );
    if (partial.length > 0) {
      const suggestions = partial.map((e) => `- ${e.title}`).join("\n");
      return `No encontre una respuesta exacta, pero quizas te interese alguno de estos temas:\n\n${suggestions}\n\nPregunta con mas detalle y podre ayudarte mejor.`;
    }
    return (
      "No encontre informacion sobre esa consulta. Puedo ayudarte con estos temas:\n\n" +
      "**Lentes:** progresivos, bifocales, monofocales, fotocromaticos, polarizados, filtro luz azul, antireflejo\n" +
      "**Materiales:** policarbonato, alto indice, Trivex\n" +
      "**Monturas:** acetato, titanio, flexon, 3D, hipoalergenicas\n" +
      "**Tratamientos:** Crizal, antiniebla, UV\n" +
      "**Marcas:** Varilux, Zeiss, Hoya, Essilor, Shamir, Nikon, Rodenstock\n" +
      "**Lentes de contacto, control de miopia, gafas de sol, seguridad industrial"
    );
  }

  const threshold = best[0].score * 0.6;
  const top = best.filter((s) => s.score >= threshold).slice(0, 3);

  const formatted = top.map((s) => `**${s.entry.title}**\n${s.entry.content}`);

  if (top.length > 1) {
    formatted.push(
      `\n*Tambien encontre otros resultados relacionados. Si necesitas mas detalles, preguntame!*`
    );
  }

  return formatted.join("\n\n---\n\n");
}

function searchAppData(query: string, inventory: InventoryItem[], customers: Customer[], invoices: Invoice[], purchases: PurchaseOrder[]): string | null {
  const q = query.toLowerCase().trim();

  const lowStock = inventory.filter((i) => i.status !== "Servicio" && i.stock <= i.minStock);
  if ((q.includes("stock bajo") || q.includes("minimo") || q.includes("poco stock") || q.includes("reabastecer") || q.includes("agotado")) && lowStock.length > 0) {
    const list = lowStock.map((i) => `- **${i.name}** (SKU: ${i.sku}) — ${i.stock} unidades (min: ${i.minStock})`).join("\n");
    return `**Productos con stock bajo (${lowStock.length})**\n${list}\n\nPuedes reponerlos desde la seccion de Compras.`;
  }

  if (q.includes("producto") || q.includes("inventario") || q.includes("articulo")) {
    if (inventory.length === 0) return "No hay productos registrados en el inventario.";
    const list = inventory.slice(0, 10).map((i) => `- **${i.name}** — ${formatMoney(i.price)} (Stock: ${i.stock})`).join("\n");
    let extra = "";
    if (inventory.length > 10) extra = `\n\n...y ${inventory.length - 10} productos mas.`;
    return `**Inventario (${inventory.length} productos)**\n${list}${extra}\n\nVe a Inventario para ver todos.`;
  }

  if (q.includes("cliente") || q.includes("paciente") || q.includes("customer")) {
    if (customers.length === 0) return "No hay clientes registrados.";
    const list = customers.slice(0, 10).map((c) => `- **${c.name}** — ${c.document || "Sin documento"}`).join("\n");
    let extra = "";
    if (customers.length > 10) extra = `\n\n...y ${customers.length - 10} clientes mas.`;
    return `**Clientes (${customers.length})**\n${list}${extra}\n\nVe a Clientes para ver todos.`;
  }

  if (q.includes("factura") || q.includes("venta") || q.includes("ingreso")) {
    if (invoices.length === 0) return "No hay facturas registradas.";
    const pagadas = invoices.filter((i) => i.status === "Pagada");
    const total = invoices.reduce((s, inv) => s + inv.lines.reduce((t, l) => t + l.qty * l.unitPrice * (1 + (l.taxRate || 0)), 0), 0);
    return `**Facturas (${invoices.length})**\n- Pagadas: ${pagadas.length}\n- Total facturado: ${formatMoney(total)}\n\nVe a Facturacion para ver todas.`;
  }

  if (q.includes("compra") || q.includes("orden")) {
    if (purchases.length === 0) return "No hay ordenes de compra registradas.";
    const pendientes = purchases.filter((p) => p.status === "Pendiente");
    const total = purchases.reduce((s, p) => s + p.total, 0);
    return `**Compras (${purchases.length})**\n- Pendientes: ${pendientes.length}\n- Total comprado: ${formatMoney(total)}\n\nVe a Compras para ver todas.`;
  }

  return null;
}

function formatMoney(value: number): string {
  return `B/. ${value.toFixed(2)}`;
}

export default function ChatBot({ knowledgeBase, darkMode, role, onNavigate, inventory = [], customers = [], invoices = [], purchases = [] }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const recentMessages = useMemo(() => messages.slice(-10), [messages]);

  useEffect(() => { saveHistory(messages); }, [messages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const showGreeting = messages.length === 0;

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const userMsg: ChatMessage = { id: msgId(), role: "user", text: trimmed, timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsTyping(true);

      setTimeout(() => {
        const wantsAppointment = detectAppointmentIntent(trimmed);
        let response: string;
        let action: "appointment" | undefined;

        if (wantsAppointment && role === "Cliente") {
          response =
            "Claro! Puedes agendar tu cita directamente desde la seccion de Citas. " +
            "Selecciona una fecha y describe el motivo de tu visita. " +
            "Tambien puedes contactarnos por WhatsApp al +507 6682-7364 si prefieres asistencia personalizada.";
          action = "appointment";
        } else if (wantsAppointment) {
          response = "Para agendar una cita, cambia al rol de Cliente en la barra lateral y ve a la seccion de Citas. Ahi podras seleccionar fecha y motivo de tu visita.";
        } else {
          const appData = searchAppData(trimmed, inventory, customers, invoices, purchases);
          if (appData) {
            response = appData;
          } else {
            response = searchKnowledge(trimmed, knowledgeBase, recentMessages);
          }
        }

        const aiMsg: ChatMessage = {
          id: msgId(),
          role: "assistant",
          text: response,
          timestamp: Date.now(),
          action,
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsTyping(false);
      }, 400 + Math.random() * 600);
    },
    [knowledgeBase, recentMessages, isTyping, role, inventory, customers, invoices, purchases]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      <div className={cn(
        "flex items-center justify-between rounded-t-[2rem] px-6 py-4",
        darkMode ? "bg-slate-900" : "bg-slate-50"
      )}>
        <div>
          <h2 className={cn("text-xl font-black", darkMode ? "text-white" : "text-slate-950")}>
            Chatbot Optico
          </h2>
          <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>
            {role === "Cliente" ? "Agenda citas y consulta sobre lentes" : "Pregunta sobre lentes, monturas, tratamientos y mas"}
          </p>
        </div>
        <button
          onClick={clearChat}
          className={cn(
            "rounded-2xl px-4 py-2 text-xs font-bold transition",
            darkMode
              ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          )}
        >
          Nuevo chat
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-4 overflow-y-auto px-6 py-4"
      >
        {showGreeting && (
          <div className="space-y-4 pt-4">
            <div className={cn(
              "rounded-2xl px-5 py-4 text-sm leading-relaxed",
              darkMode ? "bg-slate-800 text-slate-200" : "bg-white text-slate-700 ring-1 ring-slate-200"
            )}>
              <p className="font-black text-cyan-600">Hola! Soy el asistente virtual de Servicios Opticos Profesionales. 👋</p>
              <p className="mt-2">
                Puedo ayudarte con informacion sobre:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Tipos de lentes (progresivos, bifocales, monofocales)</li>
                <li>Materiales (policarbonato, alto indice, Trivex)</li>
                <li>Tratamientos (antireflejo, fotocromatico, polarizado)</li>
                <li>Monturas (acetato, titanio, flexon)</li>
                <li>Marcas recomendadas y tecnologia optica</li>
                {role === "Cliente" && <li><strong>Agendar citas</strong> y consultar sobre examenes visuales</li>}
              </ul>
              <p className="mt-2">Selecciona una pregunta sugerida o escribe la tuya!</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {role === "Cliente" && (
                <button
                  onClick={() => sendMessage("Quiero agendar una cita")}
                  className={cn(
                    "rounded-2xl px-4 py-2 text-xs font-semibold transition",
                    darkMode
                      ? "bg-cyan-700 text-white hover:bg-cyan-600"
                      : "bg-cyan-600 text-white hover:bg-cyan-700"
                  )}
                >
                  Agendar cita
                </button>
              )}
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className={cn(
                    "rounded-2xl px-4 py-2 text-xs font-semibold transition",
                    darkMode
                      ? "bg-slate-800 text-cyan-400 hover:bg-slate-700 ring-1 ring-slate-700"
                      : "bg-white text-cyan-700 ring-1 ring-cyan-200 hover:bg-cyan-50"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-5 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-cyan-600 text-white"
                  : darkMode
                    ? "bg-slate-800 text-slate-200 ring-1 ring-slate-700"
                    : "bg-white text-slate-700 ring-1 ring-slate-200"
              )}
            >
              {msg.text}
            </div>
            {msg.action === "appointment" && onNavigate && (
              <button
                onClick={() => onNavigate("citas")}
                className={cn(
                  "mt-2 rounded-2xl px-5 py-2.5 text-sm font-black transition",
                  darkMode
                    ? "bg-cyan-700 text-white hover:bg-cyan-600"
                    : "bg-cyan-600 text-white hover:bg-cyan-700"
                )}
              >
                Ir a agendar cita
              </button>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className={cn(
              "flex items-center gap-2 rounded-2xl px-5 py-3",
              darkMode ? "bg-slate-800 ring-1 ring-slate-700" : "bg-white ring-1 ring-slate-200"
            )}>
              <span className={cn("h-2 w-2 animate-bounce rounded-full", darkMode ? "bg-slate-500" : "bg-slate-400")} style={{ animationDelay: "0ms" }} />
              <span className={cn("h-2 w-2 animate-bounce rounded-full", darkMode ? "bg-slate-500" : "bg-slate-400")} style={{ animationDelay: "150ms" }} />
              <span className={cn("h-2 w-2 animate-bounce rounded-full", darkMode ? "bg-slate-500" : "bg-slate-400")} style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex gap-3 rounded-b-[2rem] px-6 py-4",
          darkMode ? "bg-slate-900" : "bg-slate-50"
        )}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta aqui..."
          disabled={isTyping}
          className={cn(
            "flex-1 rounded-2xl px-5 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-4",
            darkMode
              ? "border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:ring-cyan-500/15"
              : "border border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 focus:ring-cyan-100"
          )}
        />
        <button
          type="submit"
          disabled={!input.trim() || isTyping}
          className="rounded-2xl bg-cyan-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-700 disabled:opacity-50"
        >
          {isTyping ? "..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}
