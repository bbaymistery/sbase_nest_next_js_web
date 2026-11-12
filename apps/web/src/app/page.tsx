
'use client'
import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState('checking...')


  useEffect(() => {
    async function checkApi() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
        const data = await res.json()
        setStatus(data.status)
      } catch (error) {
        console.log(error)
        setStatus('offline')

      }
    }
    checkApi()
  }, [])

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <h1>Supavolt</h1>
      <p>API STATUS :{status}</p>
    </div>
  );
}
