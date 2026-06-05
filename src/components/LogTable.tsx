import { LogEntry } from "../types";

interface Props {
  entries: LogEntry[];
  onDoubleClick: (entry: LogEntry) => void;
}

export default function LogTable({ entries, onDoubleClick }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
        No log entries yet. Use the form above to add entries.
      </div>
    );
  }

  return (
    <table className="w-full text-sm border-collapse min-w-max">
      <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 z-10">
        <tr>
          <th
            rowSpan={2}
            className="px-3 py-1.5 text-left align-bottom font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700 whitespace-nowrap w-20"
          >
            Time
            <br />
            (24:00)
          </th>
          <th
            colSpan={2}
            className="px-3 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-300 border-b border-l border-gray-300 dark:border-gray-700"
          >
            FROM
          </th>
          <th
            colSpan={2}
            className="px-3 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-300 border-b border-l border-gray-300 dark:border-gray-700"
          >
            TO
          </th>
          <th
            rowSpan={2}
            className="px-3 py-1.5 text-left align-bottom font-semibold text-gray-600 dark:text-gray-300 border-b border-l border-gray-300 dark:border-gray-700"
          >
            Message
          </th>
        </tr>
        <tr>
          <th className="px-3 py-1 text-left font-medium text-gray-500 dark:text-gray-400 border-b border-l border-gray-300 dark:border-gray-700 whitespace-nowrap w-28">
            Call Sign/ID
          </th>
          <th className="px-3 py-1 text-left font-medium text-gray-500 dark:text-gray-400 border-b border-gray-300 dark:border-gray-700 w-16">
            Msg #
          </th>
          <th className="px-3 py-1 text-left font-medium text-gray-500 dark:text-gray-400 border-b border-l border-gray-300 dark:border-gray-700 whitespace-nowrap w-28">
            Call Sign/ID
          </th>
          <th className="px-3 py-1 text-left font-medium text-gray-500 dark:text-gray-400 border-b border-gray-300 dark:border-gray-700 w-16">
            Msg #
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, idx) => (
          <tr
            key={entry.id}
            onDoubleClick={() => onDoubleClick(entry)}
            className={`cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors ${
              idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
            }`}
            title="Double-click to edit"
          >
            <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {entry.time_value || ""}
            </td>
            <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 uppercase whitespace-nowrap border-l border-gray-200 dark:border-gray-700">
              {entry.from_callsign || ""}
            </td>
            <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 text-center">
              {entry.from_msg_num || ""}
            </td>
            <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 uppercase whitespace-nowrap border-l border-gray-200 dark:border-gray-700">
              {entry.to_callsign || ""}
            </td>
            <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 text-center">
              {entry.to_msg_num || ""}
            </td>
            <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words max-w-md border-l border-gray-200 dark:border-gray-700">
              {entry.message || ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
