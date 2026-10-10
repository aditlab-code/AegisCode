interface MinimapProps {
  lineCount?: number;
}

export function Minimap({ lineCount = 18 }: MinimapProps) {
  return (
    <div aria-hidden="true" className="minimap">
      {Array.from({ length: lineCount }, (_, index) => (
        <span
          key={index}
          style={{ width: `${26 + ((index * 17) % 48)}%` }}
        />
      ))}
    </div>
  );
}
