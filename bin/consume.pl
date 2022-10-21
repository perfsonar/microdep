#!/usr/bin/perl
#
#
#  Consume from RabbitMQ queue
#
#   (Snatched from perl-doc AnyEvent::RabbitMQ)
#
#   Author: Otto J Wittner
#
use AnyEvent::RabbitMQ;
use Data::Dumper;

my $queue_name="gap-ana3";

my $cv = AnyEvent->condvar;
 
my $ar = AnyEvent::RabbitMQ->new->load_xml_spec()->connect(
    host       => 'localhost',
    port       => 5672,
    user       => 'guest',
    pass       => 'guest',
    vhost      => '/',
    timeout    => 1,
    tls        => 0, # Or 1 if you'd like SSL
#    tls_ctx    => $anyevent_tls # or a hash of AnyEvent::TLS options.
#    tune       => { heartbeat => 30, channel_max => $whatever, frame_max = $whatever },
    nodelay    => 1, # Reduces latency by disabling Nagle's algorithm
    on_success => sub {
        my $ar = shift;
        $ar->open_channel(
            on_success => sub {
                my $channel = shift;
#                $channel->declare_exchange(
#                    exchange   => 'test_exchange',
#                    on_success => sub {
#                        $cv->send('Declared exchange');
#                    },
#                    on_failure => $cv,
#                );
		$channel->declare_queue(
		    queue => $queue_name,
		    on_success => sub {
			# Prepare to consume
			$channel->consume(
			    queue => $queue_name,
			    on_consume => sub {
				# Message consumed
				my $msg = shift;
				my $payload = $msg->{body}->payload;
#				print "Msg consumed: '", Dumper($msg), "'\n";
				print "Msg consumed: '", $payload, "'\n";
				# Make "main loop" complete
				$cv->send;
			    }
			    );
		    },
		    on_failure => $cv,
		    );
            },
            on_failure => $cv,
            on_close   => sub {
                my $method_frame = shift->method_frame;
                die $method_frame->reply_code, $method_frame->reply_text;
            },
        );
    },
    on_failure => $cv,
    on_read_failure => sub { die @_ },
    on_return  => sub {
        my $frame = shift;
        die "Unable to deliver ", Dumper($frame);
    },
    on_close   => sub {
        my $why = shift;
        if (ref($why)) {
            my $method_frame = $why->method_frame;
            die $method_frame->reply_code, ": ", $method_frame->reply_text;
        }
        else {
            die $why;
        }
    },
);

# Main loop - wait for consumtion to complete 
print $cv->recv, "\n";

