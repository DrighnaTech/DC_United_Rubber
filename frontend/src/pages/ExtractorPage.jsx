import React, { useState } from 'react'
import HeroSection from '../components/HeroSection'
import WhatIsPage from '../components/WhatIsPage'
import Footer from '../components/Footer'
import WizardModal from '../components/WizardModal'

export default function ExtractorPage() {
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <HeroSection onOpenWizard={() => setWizardOpen(true)} />
      <WhatIsPage />
      <Footer />
      <WizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </>
  )
}
