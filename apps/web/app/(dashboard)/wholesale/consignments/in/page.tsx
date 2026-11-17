import { redirect } from 'next/navigation';

// Duplicate of /wholesale/consignments-in; kept only so old links keep working.
export default function ConsignmentsInDuplicateRoute() {
  redirect('/wholesale/consignments-in');
}
