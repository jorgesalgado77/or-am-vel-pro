import { useLandingConfig } from "@/hooks/useLandingConfig";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingUrgencyBanner } from "@/components/landing/LandingUrgencyBanner";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingBenefits } from "@/components/landing/LandingBenefits";
import { LandingCarousel } from "@/components/landing/LandingCarousel";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingProof } from "@/components/landing/LandingProof";
import { LandingPlans } from "@/components/landing/LandingPlans";
import { LandingAddons } from "@/components/landing/LandingAddons";
import { LandingLeadForm } from "@/components/landing/LandingLeadForm";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Toaster as Sonner } from "@/components/ui/sonner";

export default function LandingPage() {
  const { config, loading } = useLandingConfig();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-gray-400">Carregando...</div>
      </div>
    );
  }

  const s = config.sections_visible;

  return (
    <div className="min-h-screen bg-white">
      <Sonner />
      <LandingHeader primaryColor={config.primary_color} />
      <LandingUrgencyBanner primaryColor={config.primary_color} />

      <div className="pt-10">
        {s.hero && (
          <LandingHero
            title={config.hero_title}
            subtitle={config.hero_subtitle}
            imageUrl={config.hero_image_url}
            videoUrl={config.hero_video_url}
            primaryColor={config.primary_color}
            secondaryColor={config.secondary_color}
          />
        )}

        {s.benefits && config.benefits.length > 0 && (
          <LandingBenefits
            benefits={config.benefits}
            primaryColor={config.primary_color}
            secondaryColor={config.secondary_color}
          />
        )}

        {s.carousel && (
          <LandingCarousel
            images={config.carousel_images}
            primaryColor={config.primary_color}
          />
        )}

        {s.how_it_works && config.how_it_works.length > 0 && (
          <LandingHowItWorks
            steps={config.how_it_works}
            primaryColor={config.primary_color}
            secondaryColor={config.secondary_color}
          />
        )}

        <LandingTestimonials primaryColor={config.primary_color} />

        {s.proof && (
          <LandingProof
            text={config.proof_text}
            primaryColor={config.primary_color}
            secondaryColor={config.secondary_color}
          />
        )}

        {s.plans && config.plans.length > 0 && (
          <LandingPlans
            plans={config.plans}
            primaryColor={config.primary_color}
          />
        )}

        <LandingAddons primaryColor={config.primary_color} />

        {s.lead_form && (
          <LandingLeadForm primaryColor={config.primary_color} />
        )}

        {s.cta_final && (
          <LandingCTA
            text={config.cta_final_text}
            primaryColor={config.primary_color}
            secondaryColor={config.secondary_color}
          />
        )}

        <LandingFooter
          text={config.footer_text}
          contactEmail={config.footer_contact_email}
          contactPhone={config.footer_contact_phone}
          primaryColor={config.primary_color}
        />
      </div>
    </div>
  );
}
