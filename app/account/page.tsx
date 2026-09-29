import { AccountDashboard } from "@/components/account-dashboard";
import { ServiceProfileLinks } from "@/components/service-profile-links";
import "./account-workspace.css";

export default function AccountPage() {
  return (
    <div data-account-workspace className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <AccountDashboard />
        <ServiceProfileLinks />
      </div>
    </div>
  );
}
