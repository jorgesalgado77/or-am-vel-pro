import { Mail, Phone } from "lucide-react";

interface LandingFooterProps {
  text: string;
  contactEmail: string | null;
  contactPhone: string | null;
  primaryColor: string;
}

export function LandingFooter({ text, contactEmail, contactPhone, primaryColor }: LandingFooterProps) {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: primaryColor }}>
                OM
              </div>
              <span className="text-lg font-bold">OrçaMóvel PRO</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              O sistema completo para marcenarias e lojas de móveis planejados.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Links</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="#benefits" className="hover:text-white transition-colors">Benefícios</a></li>
              <li><a href="#plans" className="hover:text-white transition-colors">Planos</a></li>
              <li><a href="#lead-form" className="hover:text-white transition-colors">Teste Grátis</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contato</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              {contactEmail && (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${contactEmail}`} className="hover:text-white transition-colors">{contactEmail}</a>
                </li>
              )}
              {contactPhone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>{contactPhone}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-8 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} OrçaMóvel PRO. {text}</p>
          <p className="mt-1">CNPJ: 58.847.751/0001-28</p>
        </div>
      </div>
    </footer>
  );
}
