import React, { useState, useEffect, FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Asterisk,
  Menu,
  X,
  Plus,
  Search,
  LayoutDashboard,
  Users,
  Contact,
  FolderOpen,
  CheckCheck,
  Wallet,
  Send,
  LogOut,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  Check,
  Lock,
  Globe,
  Palette,
  Target,
  CalendarDays,
  Pencil,
  Archive,
} from "lucide-react";
import "./style.css";
type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "team" | "client";
  client_id: string | null;
  disabled?: number;
};
type Data = {
  name: string;
  status: string;
  notes: string;
  email?: string;
  phone?: string;
  due?: string;
  amount_cents?: number;
  direction?: string;
};
type Entry = {
  id: string;
  client_id: string | null;
  data: Data;
  updated_at: string;
};
type Kind =
  "clients" | "leads" | "projects" | "tasks" | "finance" | "campaigns";
const sections: {
  key: Kind;
  label: string;
  icon: typeof Users;
  singular: string;
  statuses: string[];
}[] = [
  {
    key: "leads",
    label: "CRM & contatos",
    icon: Contact,
    singular: "Contato",
    statuses: [
      "Novo contato",
      "Em conversa",
      "Proposta enviada",
      "Conquistado",
      "Sem interesse",
    ],
  },
  {
    key: "clients",
    label: "Clientes",
    icon: Users,
    singular: "Cliente",
    statuses: ["Ativo", "Em pausa"],
  },
  {
    key: "projects",
    label: "Projetos",
    icon: FolderOpen,
    singular: "Projeto",
    statuses: ["Planejamento", "Em andamento", "Em aprovação", "Concluído"],
  },
  {
    key: "tasks",
    label: "Tarefas",
    icon: CheckCheck,
    singular: "Tarefa",
    statuses: ["A fazer", "Em andamento", "Em revisão", "Concluída"],
  },
  {
    key: "finance",
    label: "Financeiro",
    icon: Wallet,
    singular: "Lançamento",
    statuses: ["Pendente", "Pago", "Cancelado"],
  },
  {
    key: "campaigns",
    label: "Campanhas",
    icon: Send,
    singular: "Campanha",
    statuses: ["Ideia", "Planejamento", "Em produção", "Concluída"],
  },
];
async function api(path: string, method = "GET", data?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = (await res.json()) as {
    error?: string;
    user: User;
    records: Entry[];
    users: User[];
    more: boolean;
  };
  if (!res.ok) throw new Error(value.error || "Não foi possível concluir.");
  return value;
}
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const date = (s?: string) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "Sem prazo";
function Brand({ light = false }: { light?: boolean }) {
  return (
    <a
      className={"brand " + (light ? "light" : "")}
      href="/"
      aria-label="Agência Ilustre, início"
    >
      <Asterisk size={35} strokeWidth={2.5} />
      <span>
        ilustre<span className="brand-dot">.</span>
        <small>AGÊNCIA CRIATIVA</small>
      </span>
    </a>
  );
}
function App() {
  const [portal, setPortal] = useState(location.pathname.startsWith("/portal"));
  useEffect(() => {
    const change = () => setPortal(location.pathname.startsWith("/portal"));
    addEventListener("popstate", change);
    return () => removeEventListener("popstate", change);
  }, []);
  useEffect(() => {
    let dialog: HTMLElement | null = null,
      previous: HTMLElement | null = null;
    const sync = () => {
      const next = document.querySelector<HTMLElement>('[role="dialog"]');
      if (next === dialog) return;
      if (!next) {
        document.body.style.overflow = "";
        previous?.focus();
      } else {
        previous = document.activeElement as HTMLElement;
        document.body.style.overflow = "hidden";
        requestAnimationFrame(() =>
          next
            .querySelector<HTMLElement>("input,button,select,textarea,[href]")
            ?.focus(),
        );
      }
      dialog = next;
    };
    const keyboard = (e: KeyboardEvent) => {
      if (!dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea,select,a[href]",
        ),
      ).filter((x) => x.offsetParent !== null);
      if (e.key === "Escape") {
        dialog.querySelector<HTMLButtonElement>(".close-modal")?.click();
      }
      if (e.key === "Tab" && items.length) {
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", keyboard);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = "";
    };
  }, []);
  return portal ? <Portal /> : <Website />;
}
function Website() {
  const [menu, setMenu] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [privacy, setPrivacy] = useState(false);
  async function contact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/contact", "POST", {
        name: form.get("name"),
        email: form.get("email"),
        message: form.get("message"),
        website: form.get("website"),
        consent: form.get("consent") === "on",
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="site-header wrap">
        <Brand />
        <nav className={menu ? "open" : ""} aria-label="Principal">
          <a href="#sobre" onClick={() => setMenu(false)}>
            A agência
          </a>
          <a href="#servicos" onClick={() => setMenu(false)}>
            O que fazemos
          </a>
          <a href="#processo" onClick={() => setMenu(false)}>
            Nosso jeito
          </a>
          <a href="/portal" className="portal-link">
            Área do cliente <ArrowUpRight size={16} />
          </a>
        </nav>
        <button
          className="menu-button icon-button"
          aria-label={menu ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <main id="conteudo">
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="green-dot" /> ESTRATÉGIA, DESIGN & CONEXÃO
            </p>
            <h1>
              Boas ideias.
              <br />
              Marcas <em>ilustres.</em>
            </h1>
            <p className="hero-description">
              Transformamos a essência da sua marca em presença. Com estratégia,
              criatividade e um olhar atento ao que vem depois.
            </p>
            <a className="button dark" href="#contato">
              Vamos criar o próximo capítulo <ArrowUpRight size={20} />
            </a>
            <div className="hero-foot">
              <span>CRIATIVIDADE COM DIREÇÃO.</span>
              <span>PROPÓSITO EM CADA ENTREGA.</span>
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="Composição gráfica da Agência Ilustre"
          >
            <div className="art-caption">
              UM NOVO OLHAR
              <br />
              MUDA TUDO.
            </div>
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-orbit orbit-three" />
            <Asterisk className="art-star" strokeWidth={1.5} />
            <div className="art-label">
              ideias em
              <br />
              <i>movimento.</i>
            </div>
            <div className="art-bottom">
              <span>ILUSTRE STUDIO / EXPRESSÃO 01</span>
              <ArrowUpRight size={32} />
            </div>
          </div>
        </section>
        <div className="ribbon" aria-hidden="true">
          <div>
            ESTRATÉGIA <Asterisk /> DESIGN <Asterisk /> CONTEÚDO <Asterisk />{" "}
            PRESENÇA DIGITAL <Asterisk /> ESTRATÉGIA <Asterisk /> DESIGN{" "}
            <Asterisk /> CONTEÚDO <Asterisk />
          </div>
        </div>
        <section className="about wrap section" id="sobre">
          <p className="eyebrow">01 / A AGÊNCIA</p>
          <div>
            <h2>
              A sua essência merece
              <br />
              uma expressão <em>única.</em>
            </h2>
            <div className="about-bottom">
              <p>
                Acreditamos em marcas que têm algo a dizer. Por isso, começamos
                ouvindo: seu momento, seus desafios e as pessoas que você quer
                alcançar.
              </p>
              <p>
                Conectamos pensamento estratégico e sensibilidade criativa para
                construir uma comunicação coerente — do primeiro conceito ao
                encontro com o público.
              </p>
            </div>
          </div>
        </section>
        <section className="services section" id="servicos">
          <div className="wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">02 / O QUE FAZEMOS</p>
                <h2>
                  Da primeira ideia
                  <br />à próxima <em>conexão.</em>
                </h2>
              </div>
              <p>
                Frentes que se complementam.
                <br />
                Uma direção que faz sentido.
              </p>
            </div>
            {[
              {
                n: "01",
                icon: Target,
                title: "Estratégia de marca",
                text: "Clareza para escolher o caminho. Posicionamento, diagnóstico e planejamento de comunicação.",
                tags: "POSICIONAMENTO · PLANEJAMENTO · VOZ DA MARCA",
              },
              {
                n: "02",
                icon: Palette,
                title: "Identidade & design",
                text: "Uma linguagem visual que traduz quem você é. Identidades, sistemas gráficos e materiais de comunicação.",
                tags: "IDENTIDADE VISUAL · DIREÇÃO DE ARTE · DESIGN",
              },
              {
                n: "03",
                icon: Send,
                title: "Conteúdo & presença",
                text: "Conversas relevantes para aproximar sua marca das pessoas. Conteúdo, campanhas e planejamento editorial.",
                tags: "REDES SOCIAIS · CONTEÚDO · CAMPANHAS",
              },
              {
                n: "04",
                icon: Globe,
                title: "Experiências digitais",
                text: "Espaços digitais para apresentar, conectar e facilitar. Sites institucionais e experiências pensadas para o seu público.",
                tags: "SITES · INTERFACE · EXPERIÊNCIA",
              },
            ].map((s) => (
              <details className="service-row" key={s.n}>
                <summary>
                  <span className="service-number">{s.n}</span>
                  <s.icon className="service-icon" />
                  <h3>{s.title}</h3>
                  <Plus className="service-plus" />
                </summary>
                <div className="service-detail">
                  <p>{s.text}</p>
                  <small>{s.tags}</small>
                  <a href="#contato">
                    Conversar sobre esta frente <ArrowUpRight size={17} />
                  </a>
                </div>
              </details>
            ))}
          </div>
        </section>
        <section className="process wrap section" id="processo">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / NOSSO JEITO</p>
              <h2>
                Um processo claro.
                <br />
                Espaço para o <em>extraordinário.</em>
              </h2>
            </div>
            <Asterisk className="process-star" />
          </div>
          <div className="steps">
            {[
              [
                "01",
                "Escutar",
                "Antes de criar, entender. Mergulhamos na sua marca, nos seus objetivos e no contexto.",
              ],
              [
                "02",
                "Conectar",
                "Organizamos as descobertas em uma direção estratégica e um plano de trabalho.",
              ],
              [
                "03",
                "Criar",
                "Damos forma às ideias. Compartilhamos caminhos, refinamos juntos e cuidamos dos detalhes.",
              ],
              [
                "04",
                "Acompanhar",
                "Cada entrega é parte de uma relação. Mantemos o diálogo e olhamos para os próximos passos.",
              ],
            ].map((s) => (
              <article key={s[0]}>
                <span>{s[0]}</span>
                <h3>{s[1]}</h3>
                <p>{s[2]}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="portal-promo">
          <div className="wrap portal-promo-inner">
            <div>
              <p className="eyebrow">CRIAR JUNTOS. ACOMPANHAR DE PERTO.</p>
              <h2>
                Seu projeto,
                <br />
                sempre <em>por perto.</em>
              </h2>
              <p>
                Uma área para acompanhar projetos, consultar tarefas e
                visualizar os lançamentos vinculados à sua marca.
              </p>
              <a className="button pale" href="/portal">
                Acessar meu espaço <ArrowUpRight size={20} />
              </a>
            </div>
            <div
              className="portal-illustration"
              aria-label="Ilustração do portal, sem dados reais"
            >
              <div className="illustration-top">
                <Asterisk size={22} />
                <span>SEU ESPAÇO ILUSTRE</span>
                <span className="tiny-dot" />
              </div>
              <small>DO PLANO À ENTREGA</small>
              <h3>Clareza em cada etapa.</h3>
              <div className="illustration-item">
                <span className="round-icon">
                  <Check size={17} />
                </span>
                <div>
                  Estratégia alinhada<small>Um ponto de partida em comum</small>
                </div>
              </div>
              <div className="illustration-item">
                <span className="round-icon">
                  <Pencil size={17} />
                </span>
                <div>
                  Criação em movimento<small>Ideias ganhando forma</small>
                </div>
              </div>
              <div className="illustration-item">
                <span className="round-icon">
                  <ArrowUpRight size={17} />
                </span>
                <div>
                  Próximos passos visíveis
                  <small>O projeto sempre por perto</small>
                </div>
              </div>
              <p className="illustration-note">ILUSTRAÇÃO DO PROCESSO</p>
            </div>
          </div>
        </section>
        <section className="contact wrap section" id="contato">
          <div>
            <p className="eyebrow">04 / VAMOS CONVERSAR</p>
            <h2>
              O próximo capítulo
              <br />
              pode começar <em>aqui.</em>
            </h2>
            <p>
              Conte um pouco sobre sua marca e o que você quer construir. Vamos
              conhecer o seu momento.
            </p>
            <Asterisk className="contact-star" />
          </div>
          {sent ? (
            <div className="success-block" role="status">
              <CheckCheck size={38} />
              <h3>Conversa iniciada.</h3>
              <p>
                Sua mensagem foi recebida. A equipe poderá consultá-la no CRM e
                responder pelo e-mail informado.
              </p>
              <button className="text-button" onClick={() => setSent(false)}>
                Enviar outra mensagem <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <form className="contact-form" onSubmit={contact}>
              <label>
                Como podemos chamar você?
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={200}
                  placeholder="Seu nome ou sua marca"
                />
              </label>
              <label>
                Seu melhor e-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="voce@suamarca.com.br"
                />
              </label>
              <label>
                O que você tem em mente?
                <textarea
                  name="message"
                  minLength={10}
                  maxLength={4000}
                  rows={4}
                  required
                  placeholder="Conte sobre seu momento e seu projeto..."
                />
              </label>
              <label className="honeypot" aria-hidden="true">
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <label className="checkbox">
                <input type="checkbox" name="consent" required />
                <span>
                  Autorizo o uso dos meus dados para responder a este contato.{" "}
                  <button type="button" onClick={() => setPrivacy(true)}>
                    Como cuidamos dos dados
                  </button>
                </span>
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="button dark" disabled={busy}>
                {busy ? "Enviando..." : "Enviar minha ideia"}
                <ArrowUpRight size={20} />
              </button>
            </form>
          )}
        </section>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <div>
            <Brand light />
            <p>
              Estratégia que conecta.
              <br />
              Criatividade que deixa marca.
            </p>
          </div>
          <div className="footer-links">
            <a href="#servicos">Nossas frentes</a>
            <a href="/portal">Área do cliente</a>
            <button onClick={() => setPrivacy(true)}>Privacidade</button>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Agência Ilustre</span>
            <span>FEITO PARA CONECTAR.</span>
            <a href="#">Voltar ao topo ↑</a>
          </div>
        </div>
      </footer>
      {privacy && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
          >
            <button
              className="close-modal icon-button"
              onClick={() => setPrivacy(false)}
              aria-label="Fechar"
            >
              <X />
            </button>
            <p className="eyebrow">PRIVACIDADE</p>
            <h2 id="privacy-title">Seus dados, com cuidado.</h2>
            <p>
              O formulário coleta nome, e-mail e mensagem para que a Agência
              Ilustre responda à sua solicitação e organize o atendimento. Não
              envie senhas ou dados sensíveis.
            </p>
            <p>
              Os registros são armazenados na infraestrutura da Cloudflare e
              ficam acessíveis à equipe autorizada. A área de gestão utiliza um
              cookie essencial de sessão, com duração de até 8 horas. Este site
              não instala cookies de publicidade.
            </p>
            <p>
              Para solicitar acesso, correção ou exclusão dos dados, envie uma
              mensagem pelo formulário identificando sua solicitação. O
              responsável pela operação deve revisar periodicamente os contatos
              e remover dados que não sejam mais necessários.
            </p>
            <button className="button dark" onClick={() => setPrivacy(false)}>
              Entendi <Check size={18} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}
function Portal() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="loading-screen">
        <Asterisk size={40} />
        <p>Abrindo seu espaço...</p>
      </div>
    );
  return user ? (
    <Dashboard user={user} onLogout={() => setUser(null)} />
  ) : (
    <Login onLogin={setUser} />
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [setup, setSetup] = useState(location.pathname.endsWith("/configurar"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await api(setup ? "/setup" : "/login", "POST", d);
      onLogin(r.user);
      history.replaceState({}, "", "/portal");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <aside>
        <Brand light />
        <div>
          <p className="eyebrow">SEU ESPAÇO ILUSTRE</p>
          <h1>
            Boas conexões.
            <br />
            Trabalho <em>em sintonia.</em>
          </h1>
          <p>
            Projetos, prazos e próximos passos.
            <br />
            Tudo em um lugar para criar juntos.
          </p>
        </div>
        <Asterisk className="login-star" />
        <small>AGÊNCIA ILUSTRE / ÁREA DE GESTÃO</small>
      </aside>
      <section>
        <a className="back-link" href="/">
          <ChevronLeft size={18} /> Voltar ao site
        </a>
        <div className="login-box">
          <span className="login-lock">
            <Lock size={23} />
          </span>
          <p className="eyebrow">BEM-VINDO AO PORTAL</p>
          <h2>{setup ? "Primeiro acesso" : "Bom ter você por aqui."}</h2>
          <p>
            {setup
              ? "Configure a conta do responsável usando o código definido na hospedagem."
              : "Entre com o acesso fornecido pela agência."}
          </p>
          <form onSubmit={submit}>
            {setup && (
              <>
                <label>
                  Seu nome
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  Código de configuração
                  <input
                    name="token"
                    type="password"
                    autoComplete="off"
                    required
                  />
                </label>
              </>
            )}
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                minLength={setup ? 12 : 1}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button dark" disabled={busy}>
              {busy
                ? "Aguarde..."
                : setup
                  ? "Criar conta inicial"
                  : "Entrar no meu espaço"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-help">
            Precisa de acesso ou esqueceu a senha?{" "}
            <a href="/#contato">Fale com a agência.</a>
          </p>
          <button
            className="text-button setup-toggle"
            onClick={() => {
              setSetup(!setup);
              setError("");
            }}
          >
            {setup ? "Já tenho uma conta" : "Configuração inicial da agência"}
          </button>
        </div>
        <small className="login-foot">
          <Lock size={13} /> Acesso individual. Seus dados permanecem
          protegidos.
        </small>
      </section>
    </main>
  );
}
function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [active, setActive] = useState<Kind | "overview" | "settings">(
    "overview",
  );
  const [mobile, setMobile] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const available = sections.filter(
    (s) =>
      user.role !== "client" ||
      ["projects", "tasks", "finance"].includes(s.key),
  );
  async function logout() {
    await api("/logout", "POST", {});
    onLogout();
  }
  async function download() {
    setExporting(true);
    try {
      const data = await api("/export");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      link.download = `ilustre-registros-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="dashboard">
      <aside className={"sidebar " + (mobile ? "show" : "")}>
        <Brand light />
        <p className="sidebar-caption">ESPAÇO DE TRABALHO</p>
        <nav aria-label="Gestão">
          <button
            className={active === "overview" ? "active" : ""}
            onClick={() => {
              setActive("overview");
              setMobile(false);
            }}
          >
            <LayoutDashboard size={18} /> Visão geral
          </button>
          {available.map((s) => (
            <button
              key={s.key}
              className={active === s.key ? "active" : ""}
              onClick={() => {
                setActive(s.key);
                setMobile(false);
              }}
            >
              <s.icon size={18} />
              {s.label}
            </button>
          ))}
          <button
            className={active === "settings" ? "active" : ""}
            onClick={() => {
              setActive("settings");
              setMobile(false);
            }}
          >
            <Settings size={18} /> Meu acesso
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Asterisk size={22} />
            <p>
              Clareza para criar.
              <br />
              Espaço para crescer.
            </p>
          </div>
          <a href="/">
            Ver site <ArrowUpRight size={16} />
          </a>
          <button onClick={logout}>
            <LogOut size={17} /> Sair da conta
          </button>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-header">
          <button
            className="icon-button mobile-nav"
            aria-label="Alternar navegação"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
          <span>
            AGÊNCIA ILUSTRE <span className="header-divider">/</span>{" "}
            {user.role === "client" ? "ÁREA DO CLIENTE" : "GESTÃO"}
          </span>
          <div className="user-chip">
            <span>{user.name.slice(0, 2).toUpperCase()}</span>
            <div>
              {user.name}
              <small>
                {user.role === "admin"
                  ? "Administrador"
                  : user.role === "team"
                    ? "Equipe"
                    : "Cliente"}
              </small>
            </div>
          </div>
        </header>
        <main className="dashboard-content">
          {notice && (
            <p role="status" className="notice">
              {notice}
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label="Dispensar"
              >
                <X size={17} />
              </button>
            </p>
          )}
          {active === "overview" ? (
            <Overview user={user} revision={revision} navigate={setActive} />
          ) : active === "settings" ? (
            <SettingsView user={user} onLogout={onLogout} />
          ) : (
            <Records
              key={active}
              kind={active}
              user={user}
              onChange={() => setRevision((v) => v + 1)}
            />
          )}
          <footer className="dashboard-footer">
            <span>Seu espaço para trabalhar em sintonia.</span>
            {user.role === "admin" && (
              <button
                className="text-button"
                disabled={exporting}
                onClick={download}
              >
                <Download size={15} />{" "}
                {exporting ? "Exportando..." : "Exportar registros"}
              </button>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
function Overview({
  user,
  revision,
  navigate,
}: {
  user: User;
  revision: number;
  navigate: (k: Kind) => void;
}) {
  const [data, setData] = useState<Partial<Record<Kind, Entry[]>>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let valid = true;
    const available = sections.filter(
      (s) =>
        user.role !== "client" ||
        ["projects", "tasks", "finance"].includes(s.key),
    );
    Promise.all(
      available.map(
        async (s) => [s.key, (await api("/records/" + s.key)).records] as const,
      ),
    )
      .then((rows) => {
        if (valid) setData(Object.fromEntries(rows));
      })
      .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [revision, user.role]);
  const projects = data.projects ?? [];
  const tasks = data.tasks ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU DIA, COM MAIS CLAREZA</p>
          <h1>
            Olá, {user.name.split(" ")[0]}
            <span className="greeting-star">✳</span>
          </h1>
          <p>Vamos dar movimento às boas ideias?</p>
        </div>
        <span className="date-pill">
          <CalendarDays size={17} />
          {new Date().toLocaleDateString("pt-BR", {
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="overview-banner">
        <div>
          <span>UM PASSO DE CADA VEZ.</span>
          <h2>
            Organização para abrir
            <br />
            espaço à criatividade.
          </h2>
          <p>Acompanhe as entregas e mantenha o próximo passo à vista.</p>
        </div>
        <Asterisk />
      </div>
      <div className="metric-grid">
        {[
          {
            kind: "projects" as Kind,
            label: "Projetos em aberto",
            value: projects.filter((r) => r.data.status !== "Concluído").length,
            icon: FolderOpen,
          },
          {
            kind: "tasks" as Kind,
            label: "Tarefas a acompanhar",
            value: tasks.filter((r) => r.data.status !== "Concluída").length,
            icon: CheckCheck,
          },
          {
            kind: (user.role === "client" ? "finance" : "leads") as Kind,
            label:
              user.role === "client"
                ? "Lançamentos pendentes"
                : "Novos contatos",
            value:
              user.role === "client"
                ? (data.finance ?? []).filter(
                    (r) => r.data.status === "Pendente",
                  ).length
                : (data.leads ?? []).filter(
                    (r) => r.data.status === "Novo contato",
                  ).length,
            icon: user.role === "client" ? Wallet : Contact,
          },
        ].map((m) => (
          <button
            className="metric"
            key={m.kind}
            onClick={() => navigate(m.kind)}
          >
            <span>
              {m.label}
              <m.icon size={20} />
            </span>
            <strong>{data[m.kind] ? m.value : "—"}</strong>
            <small>
              Na página mais recente <ArrowUpRight size={15} />
            </small>
          </button>
        ))}
      </div>
      <div className="overview-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>Projetos em movimento</h2>
            <button
              className="text-button"
              onClick={() => navigate("projects")}
            >
              Ver todos <ArrowUpRight size={16} />
            </button>
          </div>
          {projects.length ? (
            projects.slice(0, 5).map((r) => (
              <button
                className="overview-record"
                key={r.id}
                onClick={() => navigate("projects")}
              >
                <span className="record-symbol">
                  <FolderOpen size={20} />
                </span>
                <span>
                  <strong>{r.data.name}</strong>
                  <small>{date(r.data.due)}</small>
                </span>
                <span className="badge">{r.data.status || "Sem etapa"}</span>
              </button>
            ))
          ) : (
            <Empty
              title="O próximo projeto começa aqui."
              text={
                user.role === "client"
                  ? "Seus projetos aparecerão quando forem vinculados ao seu acesso."
                  : "Cadastre um projeto e acompanhe sua evolução."
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Próximas tarefas</h2>
            <button
              className="icon-button"
              onClick={() => navigate("tasks")}
              aria-label="Ver tarefas"
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          {tasks.length ? (
            tasks
              .filter((r) => r.data.status !== "Concluída")
              .slice(0, 5)
              .map((r) => (
                <div className="task-line" key={r.id}>
                  <span className="task-circle" />
                  <div>
                    <strong>{r.data.name}</strong>
                    <small>{date(r.data.due)}</small>
                  </div>
                </div>
              ))
          ) : (
            <Empty
              title="Uma agenda com espaço."
              text="As tarefas cadastradas vão aparecer por aqui."
            />
          )}
        </section>
      </div>
    </>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Asterisk size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Records({
  kind,
  user,
  onChange,
}: {
  kind: Kind;
  user: User;
  onChange: () => void;
}) {
  const config = sections.find((s) => s.key === kind)!;
  const [rows, setRows] = useState<Entry[]>([]);
  const [clients, setClients] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Entry | "new" | null>(null);
  const [archive, setArchive] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit =
    user.role !== "client" && (kind !== "finance" || user.role === "admin");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api(
        `/records/${kind}?q=${encodeURIComponent(query)}&page=${page}`,
      );
      setRows(r.records);
      setMore(r.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [kind, query, page]);
  useEffect(() => {
    if (user.role !== "client")
      api("/records/clients")
        .then((r) => setClients(r.records))
        .catch(() => {});
  }, [user.role]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      unknown
    >;
    if (kind === "finance")
      d.amount_cents = Math.round(
        Number(String(d.amount).replace(",", ".")) * 100,
      );
    try {
      await api(
        "/records/" +
          kind +
          (editor && editor !== "new" ? "/" + editor.id : ""),
        editor === "new" ? "POST" : "PUT",
        d,
      );
      setEditor(null);
      await load();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archiveRecord() {
    if (!archive) return;
    setBusy(true);
    try {
      await api("/records/" + kind + "/" + archive.id, "DELETE", {});
      setArchive(null);
      await load();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const initial = editor && editor !== "new" ? editor.data : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {kind === "campaigns"
              ? "PLANEJAMENTO DE MARKETING"
              : "SEU ESPAÇO DE TRABALHO"}
          </p>
          <h1>{config.label}</h1>
          <p>
            {kind === "finance"
              ? "Organize receitas, despesas e vencimentos."
              : kind === "campaigns"
                ? "Organize ideias e produção. O envio de e-mails exige uma integração externa."
                : "Tudo o que importa, com clareza para acompanhar."}
          </p>
        </div>
        {canEdit && (
          <button
            className="button dark"
            onClick={() => {
              setError("");
              setEditor("new");
            }}
          >
            <Plus size={18} /> Novo {config.singular.toLowerCase()}
          </button>
        )}
      </div>
      <section className="panel records-panel">
        <div className="records-toolbar">
          <div>
            <config.icon size={20} />
            <strong>{config.label}</strong>
            <span className="count">
              {rows.length}
              {more ? "+" : ""}
            </span>
          </div>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar pelo nome"
              placeholder="Buscar pelo nome..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        {error && !editor && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="empty">Carregando registros...</div>
        ) : rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{config.singular}</th>
                  <th>Etapa</th>
                  {!["clients", "leads"].includes(kind) && <th>Prazo</th>}
                  {kind === "finance" && <th>Valor</th>}
                  {["clients", "leads"].includes(kind) && <th>Contato</th>}
                  {canEdit && (
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.data.name}</strong>
                      {r.data.notes && (
                        <details className="record-notes">
                          <summary>Ver detalhes</summary>
                          <p>{r.data.notes}</p>
                        </details>
                      )}
                      {r.client_id && (
                        <small className="client-label">
                          {clients.find((c) => c.id === r.client_id)?.data
                            .name ?? "Vinculado ao cliente"}
                        </small>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          "badge " +
                          ([
                            "Concluído",
                            "Concluída",
                            "Pago",
                            "Conquistado",
                          ].includes(r.data.status)
                            ? "done"
                            : "")
                        }
                      >
                        {r.data.status || "Sem etapa"}
                      </span>
                    </td>
                    {!["clients", "leads"].includes(kind) && (
                      <td>{date(r.data.due)}</td>
                    )}
                    {kind === "finance" && (
                      <td
                        className={
                          r.data.direction === "expense"
                            ? "amount-out"
                            : "amount-in"
                        }
                      >
                        {r.data.direction === "expense" ? "−" : "+"}
                        {money(r.data.amount_cents ?? 0)}
                      </td>
                    )}
                    {["clients", "leads"].includes(kind) && (
                      <td>
                        {r.data.email ? (
                          <a href={"mailto:" + r.data.email}>{r.data.email}</a>
                        ) : (
                          "—"
                        )}
                        <small>{r.data.phone}</small>
                      </td>
                    )}
                    {canEdit && (
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={"Editar " + r.data.name}
                            onClick={() => {
                              setError("");
                              setEditor(r);
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Arquivar " + r.data.name}
                            onClick={() => setArchive(r)}
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Espaço para um novo começo."
            text={
              query
                ? "Nenhum registro corresponde à busca."
                : canEdit
                  ? `Cadastre o primeiro ${config.singular.toLowerCase()} para começar.`
                  : "Os registros vinculados ao seu acesso aparecerão aqui."
            }
          />
        )}
        <div className="pagination">
          <span>Página {page + 1} · até 50 registros por página</span>
          <div>
            <button
              className="icon-button"
              disabled={page === 0 || loading}
              aria-label="Página anterior"
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="icon-button"
              disabled={!more || loading}
              aria-label="Próxima página"
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
      </section>
      {kind === "finance" && (
        <p className="subtle-note">
          Lançamentos internos para controle. Este espaço não emite notas
          fiscais nem processa pagamentos.
        </p>
      )}
      {editor && (
        <div className="modal-backdrop">
          <section
            className="modal editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <button
              className="close-modal icon-button"
              disabled={busy}
              onClick={() => setEditor(null)}
              aria-label="Fechar"
            >
              <X />
            </button>
            <p className="eyebrow">
              {editor === "new" ? "NOVO REGISTRO" : "EDITAR REGISTRO"}
            </p>
            <h2 id="editor-title">{config.singular}</h2>
            <form onSubmit={save}>
              <label>
                Nome / título
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={initial?.name}
                />
              </label>
              <div className="form-grid">
                <label>
                  Etapa
                  <select
                    name="status"
                    defaultValue={initial?.status || config.statuses[0]}
                  >
                    {config.statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {!["clients", "leads"].includes(kind) && (
                  <label>
                    Prazo / vencimento
                    <input name="due" type="date" defaultValue={initial?.due} />
                  </label>
                )}
                {["clients", "leads"].includes(kind) && (
                  <>
                    <label>
                      E-mail
                      <input
                        name="email"
                        type="email"
                        maxLength={254}
                        defaultValue={initial?.email}
                      />
                    </label>
                    <label>
                      Telefone
                      <input
                        name="phone"
                        type="tel"
                        maxLength={40}
                        defaultValue={initial?.phone}
                      />
                    </label>
                  </>
                )}
                {kind === "finance" && (
                  <>
                    <label>
                      Valor (R$)
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        max="1000000000"
                        step="0.01"
                        required
                        defaultValue={(initial?.amount_cents ?? 0) / 100}
                      />
                    </label>
                    <label>
                      Tipo
                      <select
                        name="direction"
                        defaultValue={initial?.direction ?? "income"}
                      >
                        <option value="income">Receita</option>
                        <option value="expense">Despesa</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
              {kind !== "clients" && kind !== "leads" && (
                <label>
                  Cliente vinculado
                  <select
                    name="client_id"
                    defaultValue={
                      editor !== "new" ? (editor.client_id ?? "") : ""
                    }
                  >
                    <option value="">Uso interno / sem vínculo</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.data.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    Apenas registros vinculados aparecem no acesso do cliente. A
                    lista mostra os 50 clientes mais recentes.
                  </small>
                </label>
              )}
              <label>
                Detalhes
                <textarea
                  name="notes"
                  rows={4}
                  maxLength={4000}
                  defaultValue={initial?.notes}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button outline"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </button>
                <button className="button dark" disabled={busy}>
                  {busy ? "Salvando..." : "Salvar registro"}
                  <Check size={18} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {archive && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-title"
          >
            <h2 id="archive-title">Arquivar registro?</h2>
            <p>
              “{archive.data.name}” sairá da lista ativa. O registro será
              preservado no banco e na exportação do administrador.
            </p>
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button
                className="button outline"
                disabled={busy}
                onClick={() => setArchive(null)}
              >
                Cancelar
              </button>
              <button
                className="button dark"
                disabled={busy}
                onClick={archiveRecord}
              >
                {busy ? "Arquivando..." : "Arquivar"}
                <Archive size={17} />
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function SettingsView({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Entry[]>([]);
  const [accessEditor, setAccessEditor] = useState<User | null>(null);
  const [accessAction, setAccessAction] = useState<
    "password" | "disable" | "enable"
  >("password");
  async function updateAccess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accessEditor) return;
    setBusy(true);
    setError("");
    try {
      await api("/users/" + accessEditor.id, "PATCH", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        action: accessAction,
      });
      setAccessEditor(null);
      setMessage("Acesso atualizado. As sessões anteriores foram encerradas.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (user.role === "admin") {
      try {
        setUsers((await api("/users")).users);
        setClients((await api("/records/clients")).records);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/password",
        "POST",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      onLogout();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/users", "POST", Object.fromEntries(new FormData(form)));
      form.reset();
      setMessage(
        "Acesso criado. Compartilhe as credenciais por um canal seguro; a pessoa pode alterar a senha ao entrar.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEGURANÇA E ACESSO</p>
          <h1>Meu acesso</h1>
          <p>
            {user.name} · {user.email}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>Trocar minha senha</h2>
          <p>Ao alterar a senha, todos os seus acessos serão encerrados.</p>
          <form onSubmit={password}>
            <label>
              Senha atual
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label>
              Nova senha
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <small>Pelo menos 12 caracteres.</small>
            </label>
            <button className="button dark" disabled={busy}>
              Alterar senha <Lock size={17} />
            </button>
          </form>
        </section>
        {user.role === "admin" && (
          <section className="panel settings-panel">
            <h2>Criar acesso</h2>
            <p>
              Equipe acompanha a operação. Clientes visualizam apenas os
              próprios projetos, tarefas e lançamentos.
            </p>
            <form onSubmit={add}>
              <label>
                Nome
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="off"
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                />
              </label>
              <div className="form-grid">
                <label>
                  Perfil
                  <select name="role">
                    <option value="team">Equipe</option>
                    <option value="client">Cliente</option>
                  </select>
                </label>
                <label>
                  Cliente vinculado
                  <select name="client_id">
                    <option value="">Selecione para perfil cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.data.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Senha inicial
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <button className="button dark" disabled={busy}>
                Criar acesso <Plus size={17} />
              </button>
            </form>
          </section>
        )}
      </div>
      {user.role === "admin" && (
        <section className="panel settings-panel">
          <h2>Acessos cadastrados</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Situação / ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {u.role === "admin"
                        ? "Administrador"
                        : u.role === "team"
                          ? "Equipe"
                          : "Cliente"}
                    </td>
                    <td>
                      <span className="badge">
                        {u.disabled ? "Bloqueado" : "Ativo"}
                      </span>
                      {u.role !== "admin" && (
                        <div className="access-actions">
                          <button
                            className="text-button"
                            onClick={() => {
                              setError("");
                              setAccessEditor(u);
                              setAccessAction(
                                u.disabled ? "enable" : "disable",
                              );
                            }}
                          >
                            {u.disabled ? "Reativar" : "Bloquear"}
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              setError("");
                              setAccessEditor(u);
                              setAccessAction("password");
                            }}
                          >
                            Redefinir senha
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {accessEditor && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-title"
          >
            <button
              className="close-modal icon-button"
              disabled={busy}
              onClick={() => setAccessEditor(null)}
              aria-label="Fechar"
            >
              <X />
            </button>
            <h2 id="access-title">
              {accessAction === "password"
                ? "Redefinir senha"
                : accessAction === "disable"
                  ? "Bloquear acesso"
                  : "Reativar acesso"}
            </h2>
            <p>
              {accessEditor.name} · {accessEditor.email}
            </p>
            <form onSubmit={updateAccess}>
              {accessAction === "password" ? (
                <label>
                  Nova senha inicial
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                  <small>
                    Compartilhe por um canal seguro. A pessoa poderá alterá-la
                    ao entrar.
                  </small>
                </label>
              ) : (
                <p className="subtle-note">
                  Os registros de negócio serão preservados. As sessões
                  anteriores serão encerradas.
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button outline"
                  disabled={busy}
                  onClick={() => setAccessEditor(null)}
                >
                  Cancelar
                </button>
                <button className="button dark" disabled={busy}>
                  {busy ? "Salvando..." : "Confirmar"}
                  <Check size={17} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
