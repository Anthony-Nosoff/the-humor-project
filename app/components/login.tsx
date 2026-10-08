'use client';

import { supabase } from "@/app/supabase/supabaseClient";

function LogInButton() {
  async function runAuth() {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : "http://localhost:3000/auth/callback";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });
    
    if (error) {
        console.error('Error during authentication:', error);
    } else {
        console.log('Authentication successful:', data);
    }

    }

    return (
        <button onClick={runAuth} style={{ padding: '10px 20px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          border: 'none', 
          borderRadius: '5px', 
          cursor: 'pointer' }}>Log In</button>
    );
}

export default LogInButton;