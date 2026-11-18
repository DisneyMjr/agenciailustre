import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Target,
  Palette,
  Send,
  Globe,
  Check,
} from "lucide-react";
import { IlustreMark } from "./brand-mark";
export const whatsapp =
  "https://wa.me/5537999129477?text=Ol%C3%A1!%20Quero%20conversar%20sobre%20um%20projeto%20com%20a%20Ilustre.";
export function AgencyHero() {
  const [focus, setFocus] = useState(0);
  const topics = [
    { name: "Estratégia", text: "Um caminho claro para a sua marca." },
    { name: "Design", text: "Uma identidade que faz sentir." },
    { name: "Conteúdo", text: "Boas conversas aproximam pessoas." },
  ];
  return (
    <section className="il-hero" aria-labelledby="il-hero-title">
      <img
        className="il-hero-photo"
        src="/images/ilustre-editorial.jpg"
        alt="Retrato editorial conceitual em preto e branco"
        width="1536"
        height="1024"
        fetchPriority="high"
      />
      <div className="il-hero-shade" />
      <div className="il-hero-intro">
        <span className="il-dot" />
        <p>
          Uma boa ideia muda tudo.
          <br />
          <strong>A próxima pode ser a sua.</strong>
        </p>
        <a href="#contato" className="il-hero-link">
          <span>
            <ArrowDownRight size={24} />
          </span>
          Conheça a Ilustre
        </a>
      </div>
      <div className="il-focus-card">
        <span className="il-kicker">NO CENTRO DA CONVERSA</span>
        <div role="group" aria-label="Frentes criativas">
          {topics.map((topic, i) => (
            <button
              key={topic.name}
              aria-pressed={focus === i}
              onClick={() => setFocus(i)}
            >
              {topic.name}
            </button>
          ))}
        </div>
        <p aria-live="polite">{topics[focus].text}</p>
      </div>
      <div className="il-light-object" aria-hidden="true">
        <div />
        <IlustreMark size={100} />
        <span>
          INSPIRE.
          <br />
          CRIE. ILUSTRE.
        </span>
      </div>
      <h1 id="il-hero-title">
        <span className="sr-only">Boas ideias. </span>
        <span>Marcas em</span>
        <span>
          <em>movimento.</em>
          <ArrowUpRight />
        </span>
      </h1>
      <div className="il-hero-bottom">
        <span>ESTRATÉGIA × CRIATIVIDADE × PRESENÇA</span>
        <a href="#sobre">
          Role para descobrir <ArrowDownRight size={15} />
        </a>
      </div>
    </section>
  );
}
export function CreativeSculpture({
  variant = "purple",
}: {
  variant?: string;
}) {
  return (
    <div className={"il-sculpture " + variant} aria-hidden="true">
      <i className="il-sculpture-ring one" />
      <i className="il-sculpture-ring two" />
      <i className="il-sculpture-ring three" />
      <span className="il-sculpture-sphere" />
      <span className="il-sculpture-dot" />
    </div>
  );
}
export function AgencyAbout() {
  return (
    <section className="il-about il-container" id="sobre">
      <div className="il-about-art">
        <CreativeSculpture />
        <div className="il-art-label">
          <IlustreMark size={27} />
          <span>
            PENSAR DIFERENTE.
            <br />
            FAZER COM PROPÓSITO.
          </span>
        </div>
        <span className="il-art-corner">↗</span>
      </div>
      <div className="il-about-copy">
        <p className="il-kicker">01 / SOMOS A ILUSTRE</p>
        <h2>
          Ideias que conectam.
          <br />
          Marcas que <em>ficam.</em>
        </h2>
        <p>
          Somos uma agência criativa para marcas que querem se expressar com
          clareza, personalidade e intenção.
        </p>
        <p>
          Combinamos estratégia, design e conteúdo para transformar o que sua
          empresa tem de único em uma presença que faz sentido para as pessoas.
        </p>
        <div className="il-about-principles">
          <span>
            <Check size={14} />
            Escuta antes da ideia.
          </span>
          <span>
            <Check size={14} />
            Criatividade com direção.
          </span>
          <span>
            <Check size={14} />
            Um olhar para o todo.
          </span>
        </div>
        <a href="#contato" className="il-text-link">
          Vamos pensar no seu próximo passo <ArrowUpRight size={18} />
        </a>
      </div>
    </section>
  );
}
const services = [
  {
    n: "01",
    icon: Target,
    title: "Estratégia de marca",
    intro: "Antes de aparecer, saber por quê.",
    text: "Clareza para escolher o caminho. Diagnóstico, posicionamento e planejamento de comunicação conectados ao momento da sua empresa.",
    tags: ["Posicionamento", "Planejamento", "Voz da marca"],
    art: "strategy",
  },
  {
    n: "02",
    icon: Palette,
    title: "Identidade & design",
    intro: "Uma presença que é só sua.",
    text: "Uma linguagem visual para traduzir a essência da marca em identidades, sistemas gráficos e materiais que conversam entre si.",
    tags: ["Identidade visual", "Direção de arte", "Design"],
    art: "identity",
  },
  {
    n: "03",
    icon: Send,
    title: "Conteúdo & presença",
    intro: "Sua marca na conversa certa.",
    text: "Conteúdo, campanhas e planejamento editorial para aproximar sua marca das pessoas com consistência e personalidade.",
    tags: ["Redes sociais", "Conteúdo", "Campanhas"],
    art: "content",
  },
  {
    n: "04",
    icon: Globe,
    title: "Experiências digitais",
    intro: "Da primeira visita à conexão.",
    text: "Sites e interfaces que apresentam sua empresa com clareza e facilitam o próximo passo do seu público.",
    tags: ["Sites", "Interfaces", "Experiência"],
    art: "digital",
  },
];
export function AgencyServices() {
  return (
    <section className="il-services" id="servicos">
      <div className="il-container">
        <div className="il-section-title">
          <div>
            <p className="il-kicker">02 / O QUE FAZEMOS</p>
            <h2>
              Uma ideia abre portas.
              <br />
              <em>Juntas, elas vão além.</em>
            </h2>
          </div>
          <p>
            Estratégia e criação trabalhando lado a lado.
            <br />
            Da essência da marca à sua presença no mundo.
          </p>
        </div>
        <div className="il-service-grid">
          {services.map((item) => (
            <article className={"il-service-card " + item.art} key={item.n}>
              <div className="il-service-art" aria-hidden="true">
                {item.art === "strategy" ? (
                  <CreativeSculpture variant="orange" />
                ) : item.art === "identity" ? (
                  <>
                    <span className="il-art-type">Aa</span>
                    <span className="il-type-dot" />
                  </>
                ) : item.art === "content" ? (
                  <>
                    <span className="il-content-bubble">
                      oi<span>!</span>
                    </span>
                    <IlustreMark className="il-content-mark" size={100} />
                  </>
                ) : (
                  <>
                    <div className="il-browser-art">
                      <span>● ● ●</span>
                      <strong>
                        Boas
                        <br />
                        <em>conexões.</em>
                      </strong>
                      <i>↗</i>
                    </div>
                    <span className="il-digital-orb" />
                  </>
                )}
              </div>
              <details>
                <summary>
                  <span className="il-service-number">{item.n}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.intro}</p>
                  </div>
                  <Plus size={22} />
                </summary>
                <div className="il-service-detail">
                  <p>{item.text}</p>
                  <div className="il-service-tags">
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <a href="#contato">
                    Conversar sobre esta frente <ArrowUpRight size={17} />
                  </a>
                </div>
              </details>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
export function AgencyProcess() {
  return (
    <section className="il-process il-container" id="processo">
      <div className="il-section-title">
        <div>
          <p className="il-kicker">04 / NOSSO JEITO DE FAZER</p>
          <h2>
            Clareza no processo.
            <br />
            <em>Liberdade para criar.</em>
          </h2>
        </div>
        <IlustreMark size={74} />
      </div>
      <div className="il-process-grid">
        {[
          {
            n: "01",
            title: "Escutar",
            text: "Entender sua marca, seu momento e o que precisa mudar.",
          },
          {
            n: "02",
            title: "Conectar",
            text: "Transformar o diagnóstico em uma direção para a comunicação.",
          },
          {
            n: "03",
            title: "Criar",
            text: "Dar forma às ideias e construir a solução junto com você.",
          },
          {
            n: "04",
            title: "Acompanhar",
            text: "Organizar entregas, alinhar os próximos passos e manter o diálogo.",
          },
        ].map((s) => (
          <article key={s.n}>
            <span>{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <ArrowRight size={18} />
          </article>
        ))}
      </div>
    </section>
  );
}
export function AgencyCTA() {
  return (
    <section className="il-cta-strip">
      <div className="il-container">
        <IlustreMark size={74} />
        <h2>
          Tem uma ideia?
          <br />
          <em>Vamos fazer acontecer.</em>
        </h2>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="il-button il-dark"
        >
          Falar pelo WhatsApp <ArrowUpRight size={19} />
        </a>
      </div>
    </section>
  );
}
