'use client';

import {
  Heart,
  LogOut,
  Package,
  Users,
} from 'lucide-react';

export type DashboardTab =
  | 'orders'
  | 'saved'
  | 'circles';

type Props = {
  activeTab: DashboardTab;
  onChange: (
    tab: DashboardTab,
  ) => void;
  onLogout: () => void;
};

const items: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof Package;
}> = [
  {
    id: 'orders',
    label: 'Orders',
    icon: Package,
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: Heart,
  },
  {
    id: 'circles',
    label: 'Shopping Circles',
    icon: Users,
  },
];

export default function DashboardSidebar({
  activeTab,
  onChange,
  onLogout,
}: Props) {
  return (
    <aside className="dash-side">
      <div className="dash-side-brand">
        <span>SPOTC</span>
        <br />
        <small>User Dashboard</small>
      </div>

      <nav>
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              type="button"
              key={item.id}
              className={
                activeTab === item.id
                  ? 'active'
                  : ''
              }
              onClick={() =>
                onChange(item.id)
              }
            >
              <Icon />

              <span>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className="dash-logout"
        onClick={onLogout}
      >
        <LogOut />
        Logout
      </button>
    </aside>
  );
}