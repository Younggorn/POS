using System;
using System.Data.OleDb;
using System.Globalization;
using System.IO;
using System.Text;

public static class LegacyCsvExporter
{
    private static readonly char[] CsvSpecialCharacters = { ',', '"', '\n', '\r' };

    private static void WriteField(TextWriter writer, object value)
    {
        if (value == null || value == DBNull.Value) return;
        string text;
        if (value is DateTime)
            text = ((DateTime)value).ToString("o", CultureInfo.InvariantCulture);
        else if (value is IFormattable)
            text = ((IFormattable)value).ToString(null, CultureInfo.InvariantCulture);
        else
            text = Convert.ToString(value, CultureInfo.InvariantCulture);

        if (text.IndexOfAny(CsvSpecialCharacters) < 0)
        {
            writer.Write(text);
            return;
        }
        writer.Write('"');
        writer.Write(text.Replace("\"", "\"\""));
        writer.Write('"');
    }

    public static long ExportTable(OleDbConnection connection, string tableName, string csvPath)
    {
        return ExportTable(connection, tableName, csvPath, null);
    }

    public static long ExportTable(OleDbConnection connection, string tableName, string csvPath, Action<long> progress)
    {
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT * FROM [" + tableName.Replace("]", "]]") + "]";
            using (var reader = command.ExecuteReader())
            using (var writer = new StreamWriter(csvPath, false, new UTF8Encoding(false), 65536))
            {
                int columns = reader.FieldCount;
                for (int column = 0; column < columns; column++)
                {
                    if (column > 0) writer.Write(',');
                    WriteField(writer, reader.GetName(column));
                }
                writer.WriteLine();

                long rows = 0;
                var timer = System.Diagnostics.Stopwatch.StartNew();
                while (reader.Read())
                {
                    for (int column = 0; column < columns; column++)
                    {
                        if (column > 0) writer.Write(',');
                        WriteField(writer, reader.GetValue(column));
                    }
                    writer.WriteLine();
                    rows++;
                    if (progress != null && rows % 1000 == 0 && timer.ElapsedMilliseconds >= 250)
                    {
                        progress(rows);
                        timer.Restart();
                    }
                }
                if (progress != null) progress(rows);
                return rows;
            }
        }
    }
}
