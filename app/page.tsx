import { supabase } from '@/app/supabase/supabaseClient'
import LogInButton from '@/app/components/login'
import Link from 'next/link'

export default async function Page() {

  const { data: spongebobCharacters } = await supabase.from('sample').select()
  console.log('spongebobCharacters', spongebobCharacters)



  return (
    <div className="py-8 max-w-4xl mx-auto px-4">
      <h2 className="text-xl font-semibold mb-4">The Humor Project Assignment 4: Caption Rating App</h2>
      <div className="flex items-center gap-4 mb-6">
        <LogInButton></LogInButton>
        <Link
          href="/memes"
          className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-purple-700 transition"
        >
          <span>🎭</span>
          <span>View & Rate Memes</span>
        </Link>
      </div>
    </div>
  )
}