import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type UserRole = 'superadmin' | 'admin' | 'supervisor' | 'agente' | 'tlmk' | 'none';

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  role: UserRole | string;
  status: string;
  avatarUrl?: string;
  company?: string;
  department?: string;
  createdAt?: string;
  lastLogin?: string;
  [key: string]: any;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  userData: UserProfile | null;
  isApproved: boolean;
  isPending: boolean;
  isBlocked: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  userData: null,
  isApproved: false,
  isPending: false,
  isBlocked: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [loading, setLoading] = useState<boolean>(true);
  const [userData, setUserData] = useState<UserProfile | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let authGeneration = 0;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const generation = ++authGeneration;
      setUser(currentUser);
      setUserData(null);
      setLoading(true);

      if (unsubProfile) { unsubProfile(); unsubProfile = null; }

      if (!currentUser) {
        setLoading(false);
        return;
      }

      let verifiedBootstrapProfile: UserProfile | null = null;
      try {
        const token = await currentUser.getIdToken();
        const bootstrapResponse = await fetch('/api/auth/bootstrap-user', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (generation !== authGeneration) return;
        if (bootstrapResponse.ok) {
          const payload = await bootstrapResponse.json();
          const candidate = payload?.user;
          if (candidate && typeof candidate === 'object' && candidate.uid === currentUser.uid) {
            verifiedBootstrapProfile = candidate as UserProfile;
            // Use the server-verified profile immediately; don't leave an owner stuck
            // on the pending screen while Firestore's initial snapshot is resolving.
            setUserData(verifiedBootstrapProfile);
          } else {
            console.error('[auth] bootstrap returned an invalid profile');
          }
          await currentUser.getIdToken(true);
        } else {
          console.error('[auth] bootstrap rejected profile initialization', {
            status: bootstrapResponse.status,
          });
        }
      } catch (e) {
        console.warn('bootstrap-user failed:', e);
      }

      if (generation !== authGeneration) return;
      unsubProfile = onSnapshot(
        doc(db, 'users', currentUser.uid),
        (snap) => {
          if (generation !== authGeneration) return;
          const snapshotProfile = snap.exists()
            ? ({ ...snap.data(), uid: currentUser.uid } as UserProfile)
            : null;

          // A profile explicitly repaired and verified by the trusted server must
          // not be downgraded by a stale local Firestore snapshot.
          const bootstrapIsApprovedSuperAdmin =
            verifiedBootstrapProfile?.status === 'approved' &&
            String(verifiedBootstrapProfile?.role || '').toLowerCase() === 'superadmin';
          const snapshotIsPending =
            !snapshotProfile ||
            String(snapshotProfile.status || '').toLowerCase() !== 'approved';

          if (bootstrapIsApprovedSuperAdmin && snapshotIsPending) {
            setUserData(verifiedBootstrapProfile);
          } else {
            setUserData(snapshotProfile || verifiedBootstrapProfile);
          }
          setLoading(false);
        },
        (err) => {
          if (generation !== authGeneration) return;
          console.warn('Profile sync handled:', err?.message);
          if (verifiedBootstrapProfile) setUserData(verifiedBootstrapProfile);
          setLoading(false);
        }
      );
    });

    return () => {
      authGeneration++;
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const handleSignOut = async () => {
    localStorage.removeItem('kaivincia_active_user');
    localStorage.removeItem('kaivincia_operator_session');
    localStorage.removeItem('kaivincia_guest');
    await fbSignOut(auth);
    setUser(null);
    setUserData(null);
  };

  const refreshProfile = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const token = await currentUser.getIdToken();
    const response = await fetch('/api/auth/bootstrap-user', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('No se pudo actualizar el perfil de acceso.');
    const payload = await response.json();
    if (payload?.user?.uid === currentUser.uid) {
      setUserData(payload.user as UserProfile);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, userData,
      isApproved: String(userData?.status || '').toLowerCase() === 'approved',
      isPending: !userData || ['pending', 'active', ''].includes(String(userData?.status || '').toLowerCase()),
      isBlocked: ['blocked', 'rejected'].includes(String(userData?.status || '').toLowerCase()),
      signOut: handleSignOut, refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
