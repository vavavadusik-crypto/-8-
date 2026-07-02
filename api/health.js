export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    service: "hermest-board",
    version: "0.1.0"
  });
}
