import { supabase } from '@/app/supabase/supabaseClient'
import LogInButton from '@/app/components/login'

export default async function Page() {

  const { data: spongebobCharacters } = await supabase.from('sample').select()
  console.log('spongebobCharacters', spongebobCharacters)



  return (
    <>
      <h2 className="text-xl font-semibold">The Humor Project Assignment 3: Auth</h2>
      <LogInButton></LogInButton>
      <h1 className="text-2xl font-bold">SpongeBob Character Data</h1>
      <table className="table-auto border-collapse border border-gray-300 gap-4 padding-4">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Type of Creature</th>
            <th>Image</th>
          </tr>
        </thead>
        <tbody>
          {spongebobCharacters?.map((character) => (
            <tr key={character.id}>
              <td>{character.id}</td>
              <td>{character.name}</td>
              <td>{character.type}</td>
              <td>
                <img src={character.image} alt={character.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}