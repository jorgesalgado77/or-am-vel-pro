import { Star, Quote } from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";

interface LandingTestimonialsProps {
  primaryColor: string;
}

const TESTIMONIALS = [
  {
    name: "Carlos Mendes",
    role: "Proprietário",
    company: "CM Móveis Planejados",
    city: "São Paulo, SP",
    text: "Antes do OrçaMóvel PRO, eu perdia horas fazendo orçamentos na mão. Agora faço em 5 minutos e o cliente recebe na hora. Minhas vendas triplicaram em 3 meses!",
    rating: 5,
    avatar: "CM",
  },
  {
    name: "Fernanda Oliveira",
    role: "Gerente Comercial",
    company: "Studio Design Interiores",
    city: "Curitiba, PR",
    text: "O simulador de financiamento é incrível. O cliente vê as parcelas na hora e fecha muito mais rápido. Nosso ticket médio aumentou 40% desde que começamos a usar.",
    rating: 5,
    avatar: "FO",
  },
  {
    name: "Roberto Almeida",
    role: "Proprietário",
    company: "Almeida Marcenaria",
    city: "Belo Horizonte, MG",
    text: "Controle total de comissões, contratos automáticos e dashboard completo. É tudo que eu precisava para profissionalizar minha marcenaria. Recomendo demais!",
    rating: 5,
    avatar: "RA",
  },
  {
    name: "Juliana Santos",
    role: "Vendedora",
    company: "Espaço & Forma",
    city: "Rio de Janeiro, RJ",
    text: "Minha comissão aumentou 60% depois que comecei a usar o sistema. A apresentação do orçamento fica tão profissional que o cliente confia muito mais na negociação.",
    rating: 5,
    avatar: "JS",
  },
];

export function LandingTestimonials({ primaryColor }: LandingTestimonialsProps) {
  return (
    <section id="testimonials" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="text-center mb-14">
            <span
              className="inline-block text-xs font-bold uppercase tracking-widest mb-3 px-4 py-1.5 rounded-full"
              style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
            >
              Depoimentos
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Quem usa, <span style={{ color: primaryColor }}>recomenda</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Veja o que nossos clientes dizem sobre o OrçaMóvel PRO
            </p>
          </div>
        </AnimatedSection>

        <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <StaggerItem key={i}>
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-full flex flex-col hover:shadow-md transition-shadow">
                <Quote className="h-6 w-6 mb-3 opacity-20" style={{ color: primaryColor }} />
                <p className="text-sm text-gray-700 leading-relaxed flex-1 mb-5">
                  "{t.text}"
                </p>
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role} · {t.company}</p>
                    <p className="text-xs text-gray-400">{t.city}</p>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
