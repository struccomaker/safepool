import CallToActionSection from '@/components/landing/CallToActionSection'
import HeroSection from '@/components/landing/HeroSection'
import HighlightsSection from '@/components/landing/HighlightsSection'
import HowItWorksSection from '@/components/landing/HowItWorksSection'
import StatsSection from '@/components/landing/StatsSection'

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden pb-12">
      <HeroSection />
      <StatsSection />
      <HowItWorksSection />
      <HighlightsSection />
      <CallToActionSection />
    </div>
  )
}
