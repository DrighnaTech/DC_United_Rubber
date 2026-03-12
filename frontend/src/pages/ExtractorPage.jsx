import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import HeroSection from '../components/HeroSection'
import WhatIsPage from '../components/WhatIsPage'
import Footer from '../components/Footer'
import WizardModal from '../components/WizardModal'

export default function ExtractorPage() {
  const { isDark } = useOutletContext()
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <HeroSection onOpenWizard={() => setWizardOpen(true)} isDark={isDark} />
      <WhatIsPage isDark={isDark} />
      <Footer light={!isDark} />
      <WizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} isDark={isDark} />
    </>
  )
}
