interface DynamicRoomProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function DynamicGameRoom({ params }: DynamicRoomProps) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-2">
        <span className="text-xs text-slate-600">Dynamic Route Segment: [id]</span>
        <h1 className="text-2xl font-bold uppercase mt-1">
          Room: {id}
        </h1>
      </div>

      <div className="border border-black p-4 space-y-2">
        <p className="text-sm">
          Session instance active for parameter: <strong>{id}</strong>
        </p>
        <p className="text-xs text-slate-600">
          Target WebSocket endpoint: ws://127.0.0.1:8000/ws/{id}
        </p>
      </div>
    </div>
  );
}