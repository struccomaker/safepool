export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce [animation-delay:-0.3s]" />
        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce [animation-delay:-0.15s]" />
        <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" />
      </div>
    </div>
  )
}
