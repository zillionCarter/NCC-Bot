import { useEffect, useState } from 'react';
import { listUsers, setUserRole, type AdminUser } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../../types';

const ROLES: Role[] = ['student', 'teacher', 'admin'];

export function Admin() {
  const { user: actingUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listUsers()
      .then(({ users: list }) => setUsers(list))
      .catch(() => setError('Could not load the user list.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(id: string, role: Role) {
    const snapshot = users;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    try {
      await setUserRole(id, role);
    } catch {
      setUsers(snapshot);
      setError('That role change was rejected.');
    }
  }

  return (
    <div className="subtle-scroll flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-8">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-display font-semibold tracking-[-0.02em] text-ink">
          {users.length} {users.length === 1 ? 'person' : 'people'} signed up
        </h1>
        <p className="mt-2 max-w-xl text-base text-graphite">
          Roles are recorded but don&apos;t currently change anything — every account gets the same behaviour. This list
          is here so you can see who has access.
        </p>

        {error && <p className="mt-4 text-small text-wrong">{error}</p>}

        {loading ? (
          <p className="mt-8 font-mono text-micro uppercase tracking-[0.08em] text-pencil">loading…</p>
        ) : (
          <div className="subtle-scroll mt-7 overflow-x-auto">
            <table className="w-full border-collapse text-base">
              <thead>
                <tr>
                  {['Email', 'Name', 'Role', 'Joined'].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="border-b border-rule-strong px-2 py-2 text-left font-mono text-micro font-medium uppercase tracking-[0.08em] text-pencil"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry.id} className="border-b border-rule hover:bg-sunken">
                    <td className="px-2 py-2.5 text-ink">{entry.email}</td>
                    <td className="px-2 py-2.5 text-graphite">{entry.name ?? '—'}</td>
                    <td className="px-2 py-2.5">
                      {entry.id === actingUser?.id ? (
                        <span className="font-mono text-tiny text-pencil">{entry.role} (you)</span>
                      ) : (
                        <select
                          value={entry.role}
                          aria-label={`Role for ${entry.email}`}
                          onChange={(event) => handleRoleChange(entry.id, event.target.value as Role)}
                          className="rounded-md border border-rule bg-raised px-2 py-1 text-small text-ink"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-tiny text-pencil">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
