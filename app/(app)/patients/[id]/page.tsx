import { PatientProfile } from '@/components/patients/patient-profile'

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PatientProfile id={id} />
}
