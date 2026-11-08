FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/rekordly-worker ./cmd/worker

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/rekordly-worker /rekordly-worker
ENTRYPOINT ["/rekordly-worker"]
