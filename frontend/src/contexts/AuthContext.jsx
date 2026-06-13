import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load profile from profiles table
  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, centers:centers!center_id(name), departments(name)')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Error loading profile:', error);
    }
    if (data) {
      const profileData = {
        id: data.id,
        full_name: data.full_name,
        email: data.email,
        permission_group: data.permission_group,
        is_manager: data.is_manager,
        can_view_l0_pool: data.can_view_l0_pool,
        level_access_cap: data.level_access_cap,
        center_access_mode: data.center_access_mode,
        allowed_center_ids: data.allowed_center_ids,
        center_id: data.center_id,
        department_id: data.department_id,
        center_name: data.centers?.name || null,
        department_name: data.departments?.name || null,
      };
      setProfile(profileData);
      return profileData;
    }
    return null;
  };

  // Listen to auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const p = await loadProfile(data.user.id);
    return p;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const isAdmin = profile?.permission_group === 'admin';
  const isMarketing = profile?.permission_group === 'marketing';
  const isCenter = profile?.permission_group === 'center';
  const canViewL0 = profile?.can_view_l0_pool || isAdmin;

  return (
    <AuthContext.Provider value={{
      user: profile, // Giữ interface cũ: user = profile data
      authUser: user, // Raw Supabase auth user
      login, logout, loading,
      isAdmin, isMarketing, isCenter, canViewL0,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
