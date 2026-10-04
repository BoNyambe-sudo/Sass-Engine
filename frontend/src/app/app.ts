import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, SessionResponse } from './core/api.service';

type Section = 'overview' | 'members' | 'billing' | 'audit' | 'settings';

interface MetricOverview {
  mrr: number;
  churn: number;
  activeSubscriptions: number;
  newUsers: number;
  series: { newUsers: { date: string; value: number }[] };
}

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'VIEWER';
  joinedAt: string;
}

interface Plan {
  key: 'starter' | 'growth' | 'scale';
  name: string;
  available: boolean;
  features: string[];
}

interface AuditRecord {
  _id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  actorId: { name: string; email: string } | null;
  metadata: Record<string, unknown>;
}

@Component({
  imports: [CommonModule, FormsModule],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit {
  readonly session: ApiService['session'];
  readonly activeSection = signal<Section>('overview');
  readonly overview = signal<MetricOverview | null>(null);
  readonly members = signal<Member[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly subscription = signal<{ plan: string; status: string; amountCents?: number; currency?: string; currentPeriodEnd?: string | null } | null>(null);
  readonly auditLogs = signal<AuditRecord[]>([]);
  readonly organization = signal<{ id: string; name: string; slug: string; memberCount: number } | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly authMode = signal<'login' | 'signup'>('login');
  readonly showPassword = signal(false);
  readonly theme = signal<'light' | 'dark'>('light');
  readonly admin = computed(() => this.session()?.role === 'ADMIN');
  readonly initials = computed(() =>
    (this.session()?.user.name ?? 'U')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  email = '';
  password = '';
  fullName = '';
  organizationName = '';
  inviteEmail = '';
  inviteRole: Member['role'] = 'VIEWER';
  organizationNameInput = '';
  readonly today = new Date();

  constructor(private readonly api: ApiService) {
    this.session = api.session;
  }

  async ngOnInit(): Promise<void> {
    try {
      const result = await this.api.post<SessionResponse>('auth/refresh', {});
      this.api.setSession(result);
      await this.loadSection('overview');
    } catch {
      this.api.clearSession();
    } finally {
      this.loading.set(false);
    }
  }

  async submitAuth(): Promise<void> {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      const result =
        this.authMode() === 'signup'
          ? await this.api.post<SessionResponse>('auth/signup', {
              email: this.email,
              password: this.password,
              name: this.fullName,
              organizationName: this.organizationName,
            })
          : await this.api.post<SessionResponse>('auth/login', {
              email: this.email,
              password: this.password,
            });
      this.api.setSession(result);
      if (result.verificationToken) {
        await this.api.post('auth/verify-email', { token: result.verificationToken });
        this.notice.set('Your email has been verified. Welcome to your workspace.');
      }

      toggleAuthMode(): void {
        this.authMode.update((mode) => (mode === 'login' ? 'signup' : 'login'));
        this.error.set('');
        this.notice.set('');
      }

      async forgotPassword(): Promise<void> {
        if (!this.email.trim()) {
          this.error.set('Enter your work email first.');
          return;
        }
        this.error.set('');
        try {
          const result = await this.api.post<{ message: string }>('auth/forgot-password', {
            email: this.email,
          });
          this.notice.set(result.message);
        } catch (error) {
          this.showError(error);
        }
      }

      firstName(): string {
        return this.session()?.user.name.split(/\s+/)[0] ?? '';
      }

      memberInitials(name: string): string {
        return name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? '')
          .join('');
      }

      chartHeight(data: MetricOverview, value: number): number {
        const max = Math.max(...data.series.newUsers.map((point) => point.value), 1);
        return Math.max(7, (value * 100) / max);
      }
      await this.loadSection('overview');
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async selectSection(section: Section): Promise<void> {
    this.activeSection.set(section);
    this.error.set('');
    await this.loadSection(section);
  }

  async loadSection(section: Section): Promise<void> {
    const jobs: Record<Section, () => Promise<void>> = {
      overview: async () => {
        this.overview.set(await this.api.get<MetricOverview>('analytics/overview'));
        this.organization.set(
          await this.api.get<{ id: string; name: string; slug: string; memberCount: number }>(
            'organizations/current',
          ),
        );
      },
      members: async () => {
        const result = await this.api.get<{ items: Member[] }>('users?limit=100');
        this.members.set(result.items);
      },
      billing: async () => {
        const [plans, current] = await Promise.all([
          this.api.get<Plan[]>('billing/plans'),
          this.api.get<NonNullable<ReturnType<typeof this.subscription>>>('billing/subscription'),
        ]);
        this.plans.set(plans);
        this.subscription.set(current);
      },
      audit: async () => {
        const result = await this.api.get<{ items: AuditRecord[] }>('audit/logs?limit=50');
        this.auditLogs.set(result.items);
      },
      settings: async () => {
        const result = await this.api.get<{ id: string; name: string; slug: string; memberCount: number }>('organizations/current');
        this.organization.set(result);
        this.organizationNameInput = result.name;
      },
    };
    this.busy.set(true);
    try {
      await jobs[section]();
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async inviteMember(): Promise<void> {
    if (!this.inviteEmail.trim()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.post<{ invitationToken?: string }>('users/invitations', {
        email: this.inviteEmail,
        role: this.inviteRole,
      });
      this.notice.set(
        result.invitationToken
          ? `Invitation created. Development-only invitation token: ${result.invitationToken}`
          : 'Invitation created and sent.',
      );
      this.inviteEmail = '';
      await this.loadSection('members');
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async changeRole(member: Member, role: Member['role']): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.patch(`users/${member.id}/role`, { role });
      await this.loadSection('members');
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async removeMember(member: Member): Promise<void> {
    if (!globalThis.confirm(`Remove ${member.name} from this workspace?`)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.delete(`users/${member.id}`);
      this.notice.set(`${member.name} was removed from the workspace.`);
      await this.loadSection('members');
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async choosePlan(plan: Plan): Promise<void> {
    if (!plan.available) {
      this.error.set('This plan is not ready yet. Configure its Stripe price ID first.');
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.api.post<{ url: string }>('billing/checkout', { plan: plan.key });
      globalThis.location.assign(result.url);
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async openBillingPortal(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.api.post<{ url: string }>('billing/portal', {});
      globalThis.location.assign(result.url);
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async saveOrganization(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.organization.set(
      await this.api.patch<{ id: string; name: string; slug: string; memberCount: number }>(
        'organizations/current',
        { name: this.organizationNameInput },
      ),
      );
      this.notice.set('Workspace settings saved.');
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.api.post('auth/logout', {});
    } finally {
      this.api.clearSession();
      this.activeSection.set('overview');
      this.notice.set('');
    }
  }

  toggleTheme(): void {
    this.theme.update((value) => (value === 'light' ? 'dark' : 'light'));
  }

  formatMoney(value: number | undefined): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.subscription()?.currency?.toUpperCase() ?? 'USD',
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  }

  private showError(error: unknown): void {
    const message =
      typeof error === 'object' && error !== null && 'error' in error
        ? (error as { error?: { message?: string | string[] } }).error?.message
        : null;
    this.error.set(
      Array.isArray(message)
        ? message.join(', ')
        : message ?? 'Something went wrong. Please try again.',
    );
  }
}
