import { useEffect, useState } from 'react';
import { listUsers, setUserRole, type AdminUser } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../../types';

const ROLES: Role[] = ['student', 'teacher', 'admin'];

export function Admin() {
  const { user: actingUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    listUsers()
      .then(({ users }) => setUsers(users))
      .catch(() => setUsers([]));
  }, []);

  async function handleRoleChange(id: string, role: Role) {
    await setUserRole(id, role);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="font-heading text-xl font-semibold">Users</h1>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            <th className="py-2">Email</th>
            <th className="py-2">Name</th>
            <th className="py-2">Role</th>
            <th className="py-2">Joined</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line">
              <td className="py-2">{u.email}</td>
              <td className="py-2">{u.name ?? '—'}</td>
              <td className="py-2">
                {u.id === actingUser?.id ? (
                  <span>{u.role} (you)</span>
                ) : (
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                    className="rounded border border-line bg-canvas px-2 py-1"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="py-2">{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
